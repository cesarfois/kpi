import React, { useState, useMemo, useEffect } from 'react';
import { 
  FaHistory, FaFileCsv, FaCheckCircle, 
  FaClock, FaExclamationTriangle, FaUsers, FaArrowRight,
  FaCalendarAlt, FaSlidersH, FaFileAlt, FaInfoCircle, FaSearch
} from 'react-icons/fa';
import { 
  ResponsiveContainer, PieChart, Pie, Cell, 
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend 
} from 'recharts';
import { calculateRowKPIs, formatDuration } from '../utils/kpiCalculations';
import { docuwareService } from '../services/docuwareService';
import { workflowAnalyticsService } from '../services/workflowAnalyticsService';

export default function WorkflowKpiAnalyticsPage() {
  const [cabinets, setCabinets] = useState([]);
  const [selectedCabinet, setSelectedCabinet] = useState('');
  const [docTypeFieldName, setDocTypeFieldName] = useState('');
  const [docTypeOptions, setDocTypeOptions] = useState([]);
  const [selectedDocType, setSelectedDocType] = useState('');
  const [customDateField, setCustomDateField] = useState('');
  const [selectedDateField, setSelectedDateField] = useState('DWStoreDateTime');

  const getPastDateStr = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
  };
  const getTodayStr = () => {
    return new Date().toISOString().split('T')[0];
  };

  const [startDate, setStartDate] = useState(getPastDateStr(30));
  const [endDate, setEndDate] = useState(getTodayStr());

  const [calendarCountry, setCalendarCountry] = useState('AO'); // AO or PT
  const [rawRows, setRawRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchProgress, setSearchProgress] = useState({ current: 0, total: 0 });

  // Local SLA parameterization state
  const [globalSla, setGlobalSla] = useState(24);
  
  const [showSlaConfig, setShowSlaConfig] = useState(false);
  const [showCsvHelp, setShowCsvHelp] = useState(false);
  const [showSlaChartHelp, setShowSlaChartHelp] = useState(false);
  const [showRankingHelp, setShowRankingHelp] = useState(false);
  const [showPerformanceHelp, setShowPerformanceHelp] = useState(false);
  const [showCriticalHelp, setShowCriticalHelp] = useState(false);

  // Fetch Cabinets on mount
  useEffect(() => {
    const fetchCabinets = async () => {
      try {
        setLoading(true);
        const data = await docuwareService.getCabinets();
        const sortedData = data.sort((a, b) => a.Name.localeCompare(b.Name));
        setCabinets(sortedData);
        if (sortedData.length > 0) {
          setSelectedCabinet(sortedData[0].Id);
        }
      } catch (err) {
        console.error('Failed to load cabinets:', err);
        setError('Falha ao carregar armários: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchCabinets();
  }, []);

  // Fetch Fields and Document Types on Cabinet selection change
  useEffect(() => {
    if (!selectedCabinet) return;

    const fetchCabinetData = async () => {
      try {
        setLoading(true);
        setError(null);
        setSelectedDocType('');
        
        const fieldsData = await docuwareService.getCabinetFields(selectedCabinet);
        
        // Find document type field
        const preferredMatch = ['tipo de documento', 'document_type', 'tipo_doc', 'tipo de doc', 'tipo_documento'];
        const docTypeField = fieldsData.find(f => {
          const label = (f.DisplayName || f.FieldName || '').toLowerCase();
          const dbName = (f.DBFieldName || '').toLowerCase();
          return preferredMatch.some(p => label === p || label.includes(p) || dbName === p || dbName.includes(p));
        });

        // Find date field
        const dateMatch = ['data do documento', 'document_date', 'data_doc', 'data_documento', 'data'];
        const docDateField = fieldsData.find(f => {
          const label = (f.DisplayName || f.FieldName || '').toLowerCase();
          const dbName = (f.DBFieldName || '').toLowerCase();
          return dateMatch.some(p => label === p || label.includes(p) || dbName === p || dbName.includes(p)) && f.DWFieldType === 'Date';
        });

        if (docDateField) {
          setCustomDateField(docDateField.DBFieldName);
        } else {
          setCustomDateField('DWDocumentDate');
        }

        if (docTypeField) {
          setDocTypeFieldName(docTypeField.DBFieldName);
          const values = await docuwareService.getSelectList(selectedCabinet, docTypeField.DBFieldName);
          setDocTypeOptions(values.sort((a, b) => String(a).localeCompare(String(b))));
        } else {
          setDocTypeFieldName('');
          setDocTypeOptions([]);
        }
      } catch (err) {
        console.error('Failed to load cabinet details:', err);
        setError('Falha ao obter detalhes do armário: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCabinetData();
  }, [selectedCabinet]);

  // Handle SLA configuration inputs
  const handleSlaChange = (value) => {
    setGlobalSla(value);
  };

  const handleSearch = async () => {
    if (!selectedCabinet) {
      setError('Por favor, selecione um armário.');
      return;
    }

    setLoading(true);
    setError(null);
    setRawRows([]);
    setSearchProgress({ current: 0, total: 0 });

    try {
      const filters = [];
      if (selectedDocType && docTypeFieldName) {
        filters.push({ fieldName: docTypeFieldName, value: selectedDocType });
      }
      if (selectedDateField && (startDate || endDate)) {
        filters.push({ fieldName: selectedDateField, value: [startDate, endDate] });
      }

      console.log('Searching docs with filters:', filters);
      const searchRes = await docuwareService.searchDocuments(selectedCabinet, filters, 10000);
      const docs = searchRes.items || [];
      
      if (docs.length === 0) {
        setRawRows([]);
        setError('Nenhum documento encontrado com os filtros selecionados.');
        return;
      }

      setSearchProgress({ current: 0, total: docs.length });

      // Concurrency pool helper function
      const pool = async (concurrency, array, iteratorFn) => {
        const results = [];
        const executing = new Set();
        for (const item of array) {
          const p = Promise.resolve().then(() => iteratorFn(item));
          results.push(p);
          executing.add(p);
          const clean = () => executing.delete(p);
          p.then(clean, clean);
          if (executing.size >= concurrency) {
            await Promise.race(executing);
          }
        }
        return Promise.all(results);
      };

      const formatDate = (dateString) => {
        if (!dateString) return '';
        let d;
        if (typeof dateString === 'string' && dateString.startsWith('/Date(')) {
          const timestamp = parseInt(dateString.match(/-?\d+/)[0]);
          d = new Date(timestamp);
        } else {
          d = new Date(dateString);
        }

        if (!isNaN(d.getTime())) {
          if (d.getFullYear() < 2000) return '';
          return d.toISOString().replace('T', ' ').substring(0, 16);
        }
        return '';
      };

      let completedCount = 0;
      const allRowsResults = await pool(10, docs, async (doc) => {
        const docId = doc.Id;
        try {
          // Extract index fields from search result document
          const docFields = {};
          if (doc.Fields) {
            doc.Fields.forEach(f => {
              const val = f.Item || f.Int || f.Decimal || f.Date || f.DateTime || '';
              docFields[f.FieldName] = val;
            });
          }

          // Fetch History
          const instances = await workflowAnalyticsService.getHistoryByDocId(docId, selectedCabinet);

          if (!instances || instances.length === 0) {
            return [{
              'Instance GUID': '',
              'DOCID': docId,
              'Instância': 'Sem Histórico',
              'Versão': '',
              'Iniciado Em': '',
              'Atividade': '',
              'Tipo Atividade': '',
              'Decisão': '',
              'Usuário': '',
              'Data Início Tarefa': '',
              'Data Decisão': '',
              'Link Documento': docuwareService.getDocumentViewUrl(selectedCabinet, docId),
              ...docFields
            }];
          }

          const docRows = [];
          instances.sort((a, b) => (b.Version || 0) - (a.Version || 0));

          instances.forEach(instance => {
            const steps = instance.HistorySteps || [];

            if (steps.length === 0) {
              docRows.push({
                'Instance GUID': instance.Id,
                'DOCID': docId,
                'Instância': instance.Name,
                'Versão': instance.Version,
                'Iniciado Em': formatDate(instance.StartDate || instance.StartedAt),
                'Atividade': '(Sem passos)',
                'Link Documento': docuwareService.getDocumentViewUrl(selectedCabinet, docId),
                ...docFields
              });
            } else {
              steps.forEach(step => {
                const normalizedType = (step.ActivityType || '').replace(/\s+/g, '').toLowerCase();
                if (normalizedType !== 'generaltask') return;
                const infoItem = step.Info?.Item || {};
                let validUser = infoItem.UserName || step.User || step.UserName || '';
                if (!validUser && infoItem.AssignedUsers && Array.isArray(infoItem.AssignedUsers)) {
                  validUser = infoItem.AssignedUsers.join(', ');
                }

                const validDate = infoItem.DecisionDate || step.StepDate || step.TimeStamp || '';
                const validDecision = infoItem.DecisionName || step.DecisionLabel || '';
                const stepStartDate = step.StepDate || '';

                docRows.push({
                  'Instance GUID': instance.Id,
                  'DOCID': docId,
                  'Instância': instance.Name,
                  'Versão': instance.Version,
                  'Iniciado Em': formatDate(instance.StartDate || instance.StartedAt),
                  'Atividade': step.ActivityName || step.Name,
                  'Tipo Atividade': step.ActivityType,
                  'Data Início Tarefa': formatDate(stepStartDate),
                  'Decisão': validDecision,
                  'Usuário': validUser,
                  'Data Decisão': formatDate(validDate),
                  'Link Documento': docuwareService.getDocumentViewUrl(selectedCabinet, docId),
                  ...docFields
                });
              });
            }
          });
          return docRows;
        } catch (err) {
          console.error(`Error processing doc ${docId}`, err);
          return [{
            'DOCID': docId,
            'Instância': 'ERRO AO BUSCAR HISTÓRICO',
            'Link Documento': docuwareService.getDocumentViewUrl(selectedCabinet, docId)
          }];
        } finally {
          completedCount++;
          setSearchProgress({ current: completedCount, total: docs.length });
        }
      });

      const allRows = allRowsResults.flat();
      setRawRows(allRows);
    } catch (err) {
      console.error('Search error:', err);
      setError('Falha ao pesquisar e analisar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Run KPI Calculations over all rows using current configs
  const computedData = useMemo(() => {
    return rawRows.map(row => calculateRowKPIs(row, calendarCountry, globalSla));
  }, [rawRows, calendarCountry, globalSla]);

  // Dashboard Metrics
  const metrics = useMemo(() => {
    if (computedData.length === 0) return null;

    const total = computedData.length;
    const concluidas = computedData.filter(r => r['Calc_ConclusaoTarefa'] === 'Concluída').length;
    const pendentes = total - concluidas;

    const dentroSLA = computedData.filter(r => r['Calc_StatusSLA'] === 'Dentro do Prazo').length;
    const atrasoModerado = computedData.filter(r => r['Calc_StatusSLA'] === 'Atraso Moderado').length;
    const atrasoInaceitavel = computedData.filter(r => r['Calc_StatusSLA'] === 'Atraso Inaceitável').length;

    return {
      total,
      concluidas,
      pendentes,
      dentroSLA,
      dentroSlaPct: ((dentroSLA / total) * 100).toFixed(1),
      atrasoModerado,
      atrasoModeradoPct: ((atrasoModerado / total) * 100).toFixed(1),
      atrasoInaceitavel,
      atrasoInaceitavelPct: ((atrasoInaceitavel / total) * 100).toFixed(1)
    };
  }, [computedData]);

  // 1. SLA Chart Data
  const slaChartData = useMemo(() => {
    if (!metrics) return [];
    return [
      { name: 'Dentro do Prazo', value: metrics.dentroSLA, color: '#10b981' },
      { name: 'Atraso Moderado', value: metrics.atrasoModerado, color: '#f59e0b' },
      { name: 'Atraso Inaceitável', value: metrics.atrasoInaceitavel, color: '#ef4444' }
    ];
  }, [metrics]);

  // 2. Ranking Responsáveis (SLA performance)
  const rankingData = useMemo(() => {
    if (computedData.length === 0) return [];
    
    const responsaveisMap = {};
    computedData.forEach(row => {
      const resp = row['Calc_ResponsavelSLA'] || 'Não Definido';
      const isDelayed = row['Calc_StatusSLA'] !== 'Dentro do Prazo';
      const hours = row['Calc_TempoExecucaoHoras'] || 0;

      if (!responsaveisMap[resp]) {
        responsaveisMap[resp] = { name: resp, total: 0, atrasos: 0, totalHours: 0 };
      }
      
      responsaveisMap[resp].total += 1;
      responsaveisMap[resp].totalHours += hours;
      if (isDelayed) {
        responsaveisMap[resp].atrasos += 1;
      }
    });

    return Object.values(responsaveisMap)
      .map(r => ({
        ...r,
        tempoMedio: Math.round((r.totalHours / r.total) * 10) / 10
      }))
      .sort((a, b) => b.atrasos - a.atrasos)
      .slice(0, 8); // Top 8 bottleneck actors
  }, [computedData]);

  // 3. Performance by Activity
  const activityPerformance = useMemo(() => {
    if (computedData.length === 0) return [];

    const activitiesMap = {};
    computedData.forEach(row => {
      const act = row['Atividade'] || 'Tarefa';
      const isWithinSla = row['Calc_StatusSLA'] === 'Dentro do Prazo';
      const hours = row['Calc_TempoExecucaoHoras'] || 0;

      if (!activitiesMap[act]) {
        activitiesMap[act] = { name: act, total: 0, withinSla: 0, totalHours: 0 };
      }

      activitiesMap[act].total += 1;
      activitiesMap[act].totalHours += hours;
      if (isWithinSla) {
        activitiesMap[act].withinSla += 1;
      }
    });

    return Object.values(activitiesMap)
      .map(a => ({
        ...a,
        tempoMedio: Math.round((a.totalHours / a.total) * 10) / 10,
        pctDentro: Math.round((a.withinSla / a.total) * 100)
      }))
      .sort((a, b) => b.total - a.total);
  }, [computedData]);

  // 4. Critical Task List (Atividades mais críticas/atrasadas)
  const criticalTasks = useMemo(() => {
    return computedData
      .filter(row => row['Calc_StatusSLA'] === 'Atraso Inaceitável')
      .map(row => ({
        docId: row['DOCID'] || row['DWDOCID'] || 'N/A',
        workflow: row['Instância'] || 'Sem Nome',
        activity: row['Atividade'] || 'Tarefa',
        responsavel: row['Calc_ResponsavelSLA'],
        elapsedHours: row['Calc_TempoExecucaoHoras'],
        formattedTime: row['Calc_TempoFormatado'],
        link: row['Link Documento'] || '#'
      }))
      .sort((a, b) => b.elapsedHours - a.elapsedHours)
      .slice(0, 10);
  }, [computedData]);

  // Export the full enriched CSV (Original headers + Calc_ columns)
  const handleExportEnrichedCSV = () => {
    if (computedData.length === 0) return;

    // Get original headers (keys from first object excluding Calc_ ones)
    const sampleObj = computedData[0];
    const originalHeaders = Object.keys(sampleObj).filter(k => !k.startsWith('Calc_'));
    const calculatedHeaders = [
      'Calc_SLA_Horas',
      'Calc_TempoExecucaoHoras',
      'Calc_HorasUteis',
      'Calc_DiasUteis',
      'Calc_TempoFormatado',
      'Calc_StatusSLA',
      'Calc_TaskAtual',
      'Calc_ConclusaoTarefa',
      'Calc_ResponsavelSLA'
    ];

    const linkIndex = originalHeaders.findIndex(h => h.toLowerCase() === 'link documento');
    const allHeaders = linkIndex !== -1 
      ? [
          ...originalHeaders.slice(0, linkIndex + 1),
          ...calculatedHeaders,
          ...originalHeaders.slice(linkIndex + 1)
        ]
      : [...originalHeaders, ...calculatedHeaders];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(';') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerRow = allHeaders.map(h => h === 'Calc_SLA_Horas' ? 'Definição de SLA' : h).map(escapeCsv).join(';');
    const dataRows = computedData.map(row => {
      return allHeaders.map(header => escapeCsv(row[header])).join(';');
    });

    const csvContent = [headerRow, ...dataRows].join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Workflow_KPI_Analytics_Enriched_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 max-w-[95%] mx-auto space-y-8 animate-fade-in">
      {/* Header Panel */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-base-100 p-6 rounded-2xl border border-base-200 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-primary/10 text-primary rounded-2xl">
            <FaHistory className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-base-content tracking-tight">Workflow KPI Analytics</h1>
            <p className="text-base-content/60 mt-1 text-sm">
              Análise operacional inteligente, indicadores de SLA e exportação enriquecida para workflows DocuWare.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="input input-bordered flex items-center gap-2 select-sm h-10">
            <FaCalendarAlt className="text-base-content/40" />
            <select 
              value={calendarCountry} 
              onChange={(e) => setCalendarCountry(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-sm font-semibold cursor-pointer text-gray-700 bg-white"
            >
              <option value="AO">Calendário Angola (AO)</option>
              <option value="PT">Calendário Portugal (PT)</option>
            </select>
          </label>

          <button 
            onClick={() => setShowSlaConfig(!showSlaConfig)}
            className="btn btn-outline btn-sm h-10 gap-2 border-base-300 hover:bg-base-200"
          >
            <FaSlidersH /> SLA Parametrizado
          </button>
        </div>
      </div>

      {/* SLA Configuration Modal/Card */}
      {showSlaConfig && (
        <div className="card bg-base-100 border border-base-200 shadow-xl animate-fade-in-down">
          <div className="card-body p-6">
            <div className="flex items-center justify-between mb-4 border-b border-base-200 pb-2">
              <h3 className="text-lg font-bold flex items-center gap-2 text-primary">
                <FaSlidersH /> Definição de SLA Geral
              </h3>
              <button onClick={() => setShowSlaConfig(false)} className="btn btn-sm btn-circle btn-ghost">✕</button>
            </div>
            <p className="text-sm text-base-content/70 mb-4">
              Configure o limite de SLA operacional padrão (em horas úteis) para todas as atividades. A tabela de transformações e os arquivos exportados utilizarão este valor para classificar atrasos.
            </p>
            <div className="max-w-xs">
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-bold text-gray-700">Definição de SLA (Horas)</span>
                </label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={globalSla} 
                    onChange={(e) => handleSlaChange(parseFloat(e.target.value) || 0)}
                    className="input input-bordered focus:input-primary w-full pr-12 font-bold"
                    min="1"
                  />
                  <span className="absolute right-4 top-3 text-sm text-base-content/50 font-semibold">horas</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Settings Panel */}
      <div className="card bg-base-100 border border-base-200 shadow-xl">
        <div className="card-body p-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-end">
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text font-bold text-gray-700">1. Selecione o Armário</span>
              </label>
              <select 
                value={selectedCabinet} 
                onChange={(e) => setSelectedCabinet(e.target.value)}
                className="select select-bordered focus:select-primary text-base text-gray-900 bg-white"
              >
                <option value="">Selecione o armário...</option>
                {cabinets.map(c => <option key={c.Id} value={c.Id}>{c.Name}</option>)}
              </select>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text font-bold text-gray-700">2. Tipo Documental</span>
              </label>
              <select 
                value={selectedDocType} 
                onChange={(e) => setSelectedDocType(e.target.value)}
                className="select select-bordered focus:select-primary text-base text-gray-900 bg-white"
                disabled={!selectedCabinet || docTypeOptions.length === 0}
              >
                <option value="">Todos os tipos documentais</option>
                {docTypeOptions.map((d, i) => <option key={i} value={d}>{d}</option>)}
              </select>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text font-bold text-gray-700">3. Campo de Data</span>
              </label>
              <select
                className="select select-bordered focus:select-primary text-base text-gray-900 bg-white"
                value={selectedDateField}
                onChange={(e) => setSelectedDateField(e.target.value)}
                disabled={!selectedCabinet}
              >
                <option value="DWStoreDateTime">Data Store (Armazenamento)</option>
                <option value={customDateField}>Data do Documento</option>
              </select>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text font-bold text-gray-700">4. Período</span>
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  className="input input-bordered w-full text-sm text-gray-900 bg-white"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={!selectedCabinet}
                />
                <span className="text-gray-500">a</span>
                <input
                  type="date"
                  className="input input-bordered w-full text-sm text-gray-900 bg-white"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={!selectedCabinet}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <button
              onClick={handleSearch}
              disabled={loading || !selectedCabinet}
              className="btn btn-primary gap-2 text-white bg-indigo-600 hover:bg-indigo-700 border-none px-6"
            >
              <FaSearch /> Buscar e Analisar
            </button>
          </div>

          {error && (
            <div className="alert alert-error shadow-lg mt-4 animate-fade-in">
              <div>
                <span>⚠️ {error}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Analytics Dashboard Results */}
      {!loading && computedData.length > 0 && metrics && (
        <div className="space-y-8 animate-fade-in-up">
          {/* Action Row */}
          <div className="flex flex-col bg-base-100 p-4 rounded-xl border border-base-200 shadow-md space-y-4">
            <div className="flex justify-between items-center w-full">
              <div className="flex items-center gap-2 text-sm text-base-content/70">
                <FaInfoCircle className="text-info" />
                <span>Dados normalizados com sucesso. Pronto para exportação executiva.</span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowCsvHelp(!showCsvHelp)}
                  className="btn btn-outline btn-circle btn-sm text-info border-info/30 hover:bg-info/10"
                  title="Ajuda sobre as colunas do CSV"
                >
                  <FaInfoCircle className="w-4 h-4 animate-pulse" />
                </button>
                <button 
                  onClick={handleExportEnrichedCSV}
                  className="btn btn-success text-white gap-2 font-bold shadow-md shadow-success/20 hover:scale-[1.02] transition-transform"
                >
                  <FaFileCsv className="text-lg" /> Exportar Workflow Analytics CSV
                </button>
              </div>
            </div>

            {showCsvHelp && (
              <div className="bg-base-200/50 p-4 rounded-lg border border-base-300 text-sm space-y-2 animate-fade-in">
                <div className="flex justify-between items-center border-b border-base-300 pb-2 mb-2">
                  <h4 className="font-bold text-primary flex items-center gap-2">
                    <FaInfoCircle /> Legenda das Colunas do CSV Enriquecido
                  </h4>
                  <button onClick={() => setShowCsvHelp(false)} className="btn btn-xs btn-circle btn-ghost">✕</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 font-sans text-xs text-base-content/85">
                  <div className="p-3 bg-base-200 rounded-lg">
                    <div className="font-bold text-primary text-sm">Definição de SLA (Calc_SLA_Horas)</div>
                    <div className="mt-1"><strong>Descrição:</strong> SLA operacional definido globalmente (em horas úteis).</div>
                    <div className="mt-1"><strong>Campos de Origem:</strong> Definição de SLA configurada na interface.</div>
                    <div className="mt-1 text-gray-500 font-mono"><strong>Fórmula:</strong> globalSla (Default: 24h)</div>
                  </div>

                  <div className="p-3 bg-base-200 rounded-lg">
                    <div className="font-bold text-primary text-sm">Calc_TempoExecucaoHoras</div>
                    <div className="mt-1"><strong>Descrição:</strong> Duração total corrida de calendário.</div>
                    <div className="mt-1"><strong>Campos de Origem:</strong> `Data Início Tarefa`, `Data Decisão`.</div>
                    <div className="mt-1 text-gray-500 font-mono"><strong>Fórmula:</strong> (Data Decisão || Agora) - Data Início Tarefa (em Horas)</div>
                  </div>

                  <div className="p-3 bg-base-200 rounded-lg">
                    <div className="font-bold text-primary text-sm">Calc_HorasUteis</div>
                    <div className="mt-1"><strong>Descrição:</strong> Tempo de processamento descontando fins de semana e feriados nacionais.</div>
                    <div className="mt-1"><strong>Campos de Origem:</strong> `Data Início Tarefa`, `Data Decisão`, feriados do país selecionado (`calendarCountry`).</div>
                    <div className="mt-1 text-gray-500 font-mono"><strong>Fórmula:</strong> Tempo corrido no intervalo 08:00 - 18:00 (10h úteis/dia), excluindo Finais de Semana e Feriados.</div>
                  </div>

                  <div className="p-3 bg-base-200 rounded-lg">
                    <div className="font-bold text-primary text-sm">Calc_DiasUteis</div>
                    <div className="mt-1"><strong>Descrição:</strong> Horas ativas úteis convertidas para dias úteis comerciais.</div>
                    <div className="mt-1"><strong>Campos de Origem:</strong> `Calc_HorasUteis`.</div>
                    <div className="mt-1 text-gray-500 font-mono"><strong>Fórmula:</strong> Calc_HorasUteis / 8 (Jornada média diária comercial)</div>
                  </div>

                  <div className="p-3 bg-base-200 rounded-lg">
                    <div className="font-bold text-primary text-sm">Calc_TempoFormatado</div>
                    <div className="mt-1"><strong>Descrição:</strong> Tempo de calendário formatado legível.</div>
                    <div className="mt-1"><strong>Campos de Origem:</strong> `Calc_TempoExecucaoHoras`.</div>
                    <div className="mt-1 text-gray-500 font-mono"><strong>Fórmula:</strong> Conversão matemática para string "Xd Yh Zm"</div>
                  </div>

                  <div className="p-3 bg-base-200 rounded-lg">
                    <div className="font-bold text-primary text-sm">Calc_StatusSLA</div>
                    <div className="mt-1"><strong>Descrição:</strong> Avaliação do cumprimento de prazos.</div>
                    <div className="mt-1"><strong>Campos de Origem:</strong> `Calc_HorasUteis`, `Calc_SLA_Horas`.</div>
                    <div className="mt-1 text-gray-500 font-mono"><strong>Fórmula:</strong> Se HorasUteis &lt;= SLA -&gt; Dentro do Prazo; Se HorasUteis &lt;= 2x SLA -&gt; Atraso Moderado; Senão -&gt; Atraso Inaceitável</div>
                  </div>

                  <div className="p-3 bg-base-200 rounded-lg">
                    <div className="font-bold text-primary text-sm">Calc_TaskAtual</div>
                    <div className="mt-1"><strong>Descrição:</strong> Tarefa pendente ativa no momento.</div>
                    <div className="mt-1"><strong>Campos de Origem:</strong> `Atividade`, `Data Decisão`.</div>
                    <div className="mt-1 text-gray-500 font-mono"><strong>Fórmula:</strong> Se Data Decisão está vazia -&gt; retorna Atividade; Senão -&gt; vazio</div>
                  </div>

                  <div className="p-3 bg-base-200 rounded-lg">
                    <div className="font-bold text-primary text-sm">Calc_ConclusaoTarefa</div>
                    <div className="mt-1"><strong>Descrição:</strong> Situação atual da atividade.</div>
                    <div className="mt-1"><strong>Campos de Origem:</strong> `Data Decisão`.</div>
                    <div className="mt-1 text-gray-500 font-mono"><strong>Fórmula:</strong> Se Data Decisão preenchida -&gt; "Concluída"; Senão -&gt; "Pendente"</div>
                  </div>

                  <div className="p-3 bg-base-200 rounded-lg md:col-span-2">
                    <div className="font-bold text-primary text-sm">Calc_ResponsavelSLA</div>
                    <div className="mt-1"><strong>Descrição:</strong> Determinação de autoria para o cumprimento/atraso do SLA (evita culpar indivíduos por tarefas/atrasos compartilhados em fila de grupo).</div>
                    <div className="mt-1"><strong>Campos de Origem:</strong> `Usuário`, `Atividade`, `Calc_ConclusaoTarefa`, `Calc_StatusSLA`.</div>
                    <div className="mt-1 text-gray-500 font-mono"><strong>Fórmula:</strong> Se (Pendente e Usuário vazio) ou (Atrasado e Usuário com múltiplos nomes) -&gt; "Equipe - Atividade"; Senão -&gt; retorna o próprio Usuário</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Metrics Executive Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="card bg-base-100 border border-base-200 shadow-md p-4 flex flex-col justify-between">
              <span className="text-xs uppercase font-bold text-base-content/50">Total Tarefas</span>
              <span className="text-3xl font-extrabold text-base-content mt-2">{metrics.total}</span>
            </div>

            <div className="card bg-base-100 border border-base-200 shadow-md p-4 flex flex-col justify-between">
              <span className="text-xs uppercase font-bold text-success/70">Concluídas</span>
              <span className="text-3xl font-extrabold text-success mt-2">{metrics.concluidas}</span>
            </div>

            <div className="card bg-base-100 border border-base-200 shadow-md p-4 flex flex-col justify-between">
              <span className="text-xs uppercase font-bold text-amber-500/70">Pendentes</span>
              <span className="text-3xl font-extrabold text-amber-500 mt-2">{metrics.pendentes}</span>
            </div>

            <div className="card bg-base-100 border border-base-200 shadow-md p-4 flex flex-col justify-between border-l-4 border-l-success">
              <span className="text-xs uppercase font-bold text-success">Dentro do SLA</span>
              <span className="text-3xl font-extrabold text-success mt-2">
                {metrics.dentroSLA} <span className="text-xs font-normal text-base-content/50">({metrics.dentroSlaPct}%)</span>
              </span>
            </div>

            <div className="card bg-base-100 border border-base-200 shadow-md p-4 flex flex-col justify-between border-l-4 border-l-warning">
              <span className="text-xs uppercase font-bold text-warning">Atraso Moderado</span>
              <span className="text-3xl font-extrabold text-warning mt-2">
                {metrics.atrasoModerado} <span className="text-xs font-normal text-base-content/50">({metrics.atrasoModeradoPct}%)</span>
              </span>
            </div>

            <div className="card bg-base-100 border border-base-200 shadow-md p-4 flex flex-col justify-between border-l-4 border-l-error">
              <span className="text-xs uppercase font-bold text-error">Atraso Inaceitável</span>
              <span className="text-3xl font-extrabold text-error mt-2">
                {metrics.atrasoInaceitavel} <span className="text-xs font-normal text-base-content/50">({metrics.atrasoInaceitavelPct}%)</span>
              </span>
            </div>
          </div>

          {/* Graphics Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: SLA por Status */}
            <div className="card bg-base-100 border border-base-200 shadow-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-primary"></span> Distribuição de SLA por Status
                </h3>
                <button 
                  onClick={() => setShowSlaChartHelp(!showSlaChartHelp)}
                  className="btn btn-outline btn-circle btn-xs text-info border-info/20 hover:bg-info/10"
                  title="Legenda da Distribuição do SLA"
                >
                  <FaInfoCircle className="w-3 h-3 animate-pulse" />
                </button>
              </div>

              {showSlaChartHelp && (
                <div className="bg-base-200/50 p-3 rounded-lg border border-base-300 text-xs mb-4 space-y-1 animate-fade-in text-base-content/80">
                  <div className="flex justify-between items-center border-b border-base-300 pb-1 mb-1">
                    <span className="font-bold text-primary flex items-center gap-1">
                      <FaInfoCircle /> Regras do SLA por Status
                    </span>
                    <button onClick={() => setShowSlaChartHelp(false)} className="btn btn-xs btn-circle btn-ghost">✕</button>
                  </div>
                  <p><strong>Dentro do Prazo:</strong> Horas úteis trabalhadas estão dentro do limite do SLA.</p>
                  <p><strong>Atraso Moderado:</strong> Horas úteis excedem o SLA, mas são menores ou iguais a 2x o SLA.</p>
                  <p><strong>Atraso Inaceitável:</strong> Horas úteis trabalhadas são superiores a 2x o SLA configurado.</p>
                </div>
              )}
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={slaChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      label
                    >
                      {slaChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Ranking de Atrasos por Responsáveis */}
            <div className="card bg-base-100 border border-base-200 shadow-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-primary"></span> Ranking de Responsáveis (Gargalos)
                </h3>
                <button 
                  onClick={() => setShowRankingHelp(!showRankingHelp)}
                  className="btn btn-outline btn-circle btn-xs text-info border-info/20 hover:bg-info/10"
                  title="Legenda do Ranking"
                >
                  <FaInfoCircle className="w-3 h-3 animate-pulse" />
                </button>
              </div>

              {showRankingHelp && (
                <div className="bg-base-200/50 p-3 rounded-lg border border-base-300 text-xs mb-4 space-y-1 animate-fade-in text-base-content/80">
                  <div className="flex justify-between items-center border-b border-base-300 pb-1 mb-1">
                    <span className="font-bold text-primary flex items-center gap-1">
                      <FaInfoCircle /> Sobre o Ranking de Gargalos
                    </span>
                    <button onClick={() => setShowRankingHelp(false)} className="btn btn-xs btn-circle btn-ghost">✕</button>
                  </div>
                  <p>Lista os principais agentes (usuários ou equipes) ordenados pela contagem de tarefas ativas/concluídas com estouro de SLA (atrasos).</p>
                  <p>Exibe a quantidade total de atrasos (em vermelho) e o tempo médio de execução correspondente em horas de calendário (em azul).</p>
                </div>
              )}
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rankingData} layout="vertical">
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="atrasos" name="Tarefas Atrasadas" fill="#ef4444" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="tempoMedio" name="Tempo Médio (Horas)" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Activity Performance Table */}
          <div className="card bg-base-100 border border-base-200 shadow-lg overflow-hidden">
            <div className="p-6 border-b border-base-200 flex justify-between items-center">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-primary"></span> Performance Operacional por Atividade
              </h3>
              <button 
                onClick={() => setShowPerformanceHelp(!showPerformanceHelp)}
                className="btn btn-outline btn-circle btn-xs text-info border-info/20 hover:bg-info/10"
                title="Legenda da Performance"
              >
                <FaInfoCircle className="w-3 h-3 animate-pulse" />
              </button>
            </div>

            {showPerformanceHelp && (
              <div className="mx-6 mt-4 bg-base-200/50 p-4 rounded-lg border border-base-300 text-xs space-y-3 animate-fade-in text-base-content/85">
                <div className="flex justify-between items-center border-b border-base-300 pb-2">
                  <span className="font-bold text-primary flex items-center gap-1">
                    <FaInfoCircle /> Detalhes dos Indicadores de Performance Operacional
                  </span>
                  <button onClick={() => setShowPerformanceHelp(false)} className="btn btn-xs btn-circle btn-ghost">✕</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-2 bg-base-100 rounded border border-base-300">
                    <div className="font-bold text-primary">Volume Processado</div>
                    <div className="mt-0.5"><strong>Campos:</strong> `Atividade`</div>
                    <div className="text-gray-500 font-mono text-[10px]">Fórmula: total(Atividade)</div>
                  </div>

                  <div className="p-2 bg-base-100 rounded border border-base-300">
                    <div className="font-bold text-primary">Tempo Médio (Horas)</div>
                    <div className="mt-0.5"><strong>Campos:</strong> `Calc_TempoExecucaoHoras`</div>
                    <div className="text-gray-500 font-mono text-[10px]">Fórmula: soma(TempoExecucao) / Volume</div>
                  </div>

                  <div className="p-2 bg-base-100 rounded border border-base-300">
                    <div className="font-bold text-primary">% Dentro do SLA</div>
                    <div className="mt-0.5"><strong>Campos:</strong> `Calc_StatusSLA`</div>
                    <div className="text-gray-500 font-mono text-[10px]">Fórmula: (total(Status === "Dentro do Prazo") / Volume) * 100</div>
                  </div>

                  <div className="p-2 bg-base-100 rounded border border-base-300">
                    <div className="font-bold text-primary">Status Geral</div>
                    <div className="mt-0.5"><strong>Campos:</strong> `% Dentro do SLA`</div>
                    <div className="text-gray-500 font-mono text-[10px]">Fórmula: &gt;=80% -&gt; Excelente; &gt;=50% -&gt; Atenção; &lt;50% -&gt; Crítico</div>
                  </div>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr className="bg-base-50">
                    <th className="font-bold">Atividade</th>
                    <th className="font-bold text-center">Volume Processado</th>
                    <th className="font-bold text-center">Tempo Médio (Horas)</th>
                    <th className="font-bold text-center">% Dentro do SLA</th>
                    <th className="font-bold">Status Geral</th>
                  </tr>
                </thead>
                <tbody>
                  {activityPerformance.map((act) => (
                    <tr key={act.name} className="hover">
                      <td className="font-semibold text-base-content">{act.name}</td>
                      <td className="text-center font-mono">{act.total}</td>
                      <td className="text-center font-mono">{act.tempoMedio}h</td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <progress 
                            className={`progress w-20 ${act.pctDentro > 80 ? 'progress-success' : act.pctDentro > 50 ? 'progress-warning' : 'progress-error'}`} 
                            value={act.pctDentro} 
                            max="100"
                          ></progress>
                          <span className="font-mono text-sm font-semibold">{act.pctDentro}%</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge font-semibold ${act.pctDentro > 80 ? 'badge-success text-white' : act.pctDentro > 50 ? 'badge-warning' : 'badge-error'}`}>
                          {act.pctDentro > 80 ? 'Excelente' : act.pctDentro > 50 ? 'Atenção' : 'Crítico'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Critical Task List Panel */}
          <div className="card bg-base-100 border border-base-200 shadow-lg overflow-hidden border-t-4 border-t-error">
            <div className="p-6 border-b border-base-200 flex justify-between items-center bg-error/5 bg-opacity-30">
              <h3 className="text-lg font-bold text-error flex items-center gap-2">
                <FaExclamationTriangle /> Lista de Tarefas Críticas (Atraso Inaceitável)
              </h3>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowCriticalHelp(!showCriticalHelp)}
                  className="btn btn-outline btn-circle btn-xs text-error border-error/20 hover:bg-error/10"
                  title="Legenda da Lista Crítica"
                >
                  <FaInfoCircle className="w-3 h-3 animate-pulse" />
                </button>
                <span className="badge badge-error text-white font-bold">{criticalTasks.length} alertas</span>
              </div>
            </div>

            {showCriticalHelp && (
              <div className="mx-6 mt-4 bg-error/5 p-4 rounded-lg border border-error/20 text-xs space-y-3 animate-fade-in text-error-content">
                <div className="flex justify-between items-center border-b border-error/20 pb-2">
                  <span className="font-bold text-error flex items-center gap-1.5">
                    <FaExclamationTriangle className="w-4 h-4" /> Detalhes dos Campos e Fórmulas - Lista Crítica
                  </span>
                  <button onClick={() => setShowCriticalHelp(false)} className="btn btn-xs btn-circle btn-ghost text-error">✕</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="p-2.5 bg-base-100 rounded border border-error/15 shadow-sm">
                    <div className="font-bold text-error">DocID</div>
                    <div className="mt-0.5 text-base-content/80"><strong>Origem:</strong> `DOCID` / `DWDOCID`</div>
                    <div className="text-gray-500 font-mono text-[10px] mt-1">Fórmula: Identificador único do documento no DocuWare.</div>
                  </div>

                  <div className="p-2.5 bg-base-100 rounded border border-error/15 shadow-sm">
                    <div className="font-bold text-error">Workflow</div>
                    <div className="mt-0.5 text-base-content/80"><strong>Origem:</strong> `Instância`</div>
                    <div className="text-gray-500 font-mono text-[10px] mt-1">Fórmula: Nome/Identificador da instância do fluxo.</div>
                  </div>

                  <div className="p-2.5 bg-base-100 rounded border border-error/15 shadow-sm">
                    <div className="font-bold text-error">Atividade</div>
                    <div className="mt-0.5 text-base-content/80"><strong>Origem:</strong> `Atividade`</div>
                    <div className="text-gray-500 font-mono text-[10px] mt-1">Fórmula: Nome do passo operacional do tipo GeneralTask.</div>
                  </div>

                  <div className="p-2.5 bg-base-100 rounded border border-error/15 shadow-sm">
                    <div className="font-bold text-error">Responsável / Equipe</div>
                    <div className="mt-0.5 text-base-content/80"><strong>Origem:</strong> `Calc_ResponsavelSLA`</div>
                    <div className="text-gray-500 font-mono text-[10px] mt-1">Fórmula: Usuário executor ou Grupo/Fila responsável pela tarefa.</div>
                  </div>

                  <div className="p-2.5 bg-base-100 rounded border border-error/15 shadow-sm">
                    <div className="font-bold text-error">Tempo Decorrido</div>
                    <div className="mt-0.5 text-base-content/80"><strong>Origem:</strong> `Calc_TempoFormatado`</div>
                    <div className="text-gray-500 font-mono text-[10px] mt-1">Fórmula: formata(TempoExecucaoHoras) em [d] [h] [m].</div>
                  </div>

                  <div className="p-2.5 bg-base-100 rounded border border-error/15 shadow-sm">
                    <div className="font-bold text-error">Critério de Alerta</div>
                    <div className="mt-0.5 text-base-content/80"><strong>Origem:</strong> `Calc_StatusSLA`</div>
                    <div className="text-gray-500 font-mono text-[10px] mt-1">Fórmula: Horas Úteis &gt; 2 * SLA Configurado (Horas).</div>
                  </div>
                </div>
                <div className="bg-error/10 p-2 rounded text-[11px] border border-error/10 text-error-content/90">
                  <strong>Regra de Negócio:</strong> Exibe as 10 tarefas em andamento ou concluídas com maior tempo de atraso que ultrapassaram o dobro do limite de SLA geral configurado na interface.
                </div>
              </div>
            )
            }
            
            {criticalTasks.length === 0 ? (
              <div className="p-12 text-center text-base-content/50 italic">
                Nenhuma tarefa em Atraso Inaceitável encontrada. Excelente desempenho!
              </div>
            ) : (
              <div className="overflow-x-auto font-sans">
                <table className="table w-full">
                  <thead>
                    <tr className="bg-base-50">
                      <th className="font-bold">DocID</th>
                      <th className="font-bold">Workflow</th>
                      <th className="font-bold">Atividade</th>
                      <th className="font-bold">Responsável / Equipe</th>
                      <th className="font-bold text-right">Tempo Decorrido</th>
                      <th className="font-bold text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criticalTasks.map((task, idx) => (
                      <tr key={idx} className="hover">
                        <td className="font-mono font-bold text-primary">{task.docId}</td>
                        <td className="text-xs truncate max-w-xs">{task.workflow}</td>
                        <td className="font-semibold">{task.activity}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-error"></span>
                            <span className="text-sm font-semibold">{task.responsavel}</span>
                          </div>
                        </td>
                        <td className="text-right font-mono font-bold text-error">{task.formattedTime}</td>
                        <td className="text-center">
                          <a 
                            href={task.link} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className={`btn btn-xs btn-outline btn-primary gap-1 ${task.link === '#' ? 'btn-disabled' : ''}`}
                          >
                            Ver Doc. <FaArrowRight className="text-[10px]" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty State / Prompt */}
      {computedData.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center p-16 bg-base-100 rounded-2xl border border-base-200 shadow-xl text-center space-y-4">
          <div className="p-6 bg-primary/5 text-primary rounded-full animate-pulse">
            <FaFileAlt className="w-16 h-16" />
          </div>
          <h2 className="text-2xl font-bold text-base-content">Nenhum histórico carregado</h2>
          <p className="text-base-content/60 max-w-md text-sm">
            Selecione o armário, o tipo de documento correspondente e defina o período de pesquisa para iniciar a análise operacional e SLA.
          </p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-20 space-y-4 bg-base-100 rounded-2xl border border-base-200 shadow-xl">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="font-semibold text-base-content/70">
            {searchProgress.total > 0 
              ? `Processando e enriquecendo dados do workflow... (${searchProgress.current} / ${searchProgress.total})`
              : 'Processando e enriquecendo dados do workflow...'}
          </p>
        </div>
      )}
    </div>
  );
}

