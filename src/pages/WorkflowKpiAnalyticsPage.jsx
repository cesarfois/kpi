import React, { useState, useMemo } from 'react';
import { 
  FaHistory, FaUpload, FaFileCsv, FaCheckCircle, 
  FaClock, FaExclamationTriangle, FaUsers, FaArrowRight,
  FaCalendarAlt, FaSlidersH, FaFileAlt, FaInfoCircle
} from 'react-icons/fa';
import { 
  ResponsiveContainer, PieChart, Pie, Cell, 
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend 
} from 'recharts';
import { calculateRowKPIs, formatDuration } from '../utils/kpiCalculations';

export default function WorkflowKpiAnalyticsPage() {
  const [selectedCabinet, setSelectedCabinet] = useState('Armazém');
  const [selectedDocType, setSelectedDocType] = useState('Guia de Remessa');
  const [calendarCountry, setCalendarCountry] = useState('AO'); // AO or PT
  const [fileData, setFileData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Local SLA parameterization state
  const [customSlas, setCustomSlas] = useState({
    'WFP.340.16 - MCO - Conhecimento GR Cliente (BFA)::Tomada de Conhecimento': '24',
    'WFP.340.18 - MCO - GR Resolvida::Faturação': '24',
    'WFP.340.18 - MCO - GR Resolvida::Classificação das Guias': '24',
    'WFP.340.18 - MCO - GR Resolvida::Contabilização': '12',
    'Default': '24'
  });
  
  const [showSlaConfig, setShowSlaConfig] = useState(false);

  // Cabinets and DocTypes lists
  const cabinets = ['Comercial', 'Financeiro', 'Frota', 'Compras', 'Armazém'];
  const docTypes = ['Guia de Remessa', 'Pedido de Compra', 'Processo Interno'];

  // Handle SLA configuration inputs
  const handleSlaChange = (key, value) => {
    setCustomSlas(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // CSV parsing logic tailored to DocuWare structure
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        
        // Detect separator (usually ; or ,)
        const firstLine = text.split('\n')[0] || '';
        const separator = firstLine.includes(';') ? ';' : ',';

        // Parse lines, handling quotes correctly
        const rows = [];
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) {
          throw new Error('O arquivo não contém dados suficientes.');
        }

        // Clean BOM if present
        const cleanHeader = lines[0].replace(/^\uFEFF/, '');
        const headers = cleanHeader.split(separator).map(h => h.trim().replace(/^"|"$/g, ''));

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Simple CSV line parser respecting quotes
          const values = [];
          let insideQuote = false;
          let currentValue = '';

          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
              insideQuote = !insideQuote;
            } else if (char === separator && !insideQuote) {
              values.push(currentValue.trim().replace(/^"|"$/g, ''));
              currentValue = '';
            } else {
              currentValue += char;
            }
          }
          values.push(currentValue.trim().replace(/^"|"$/g, ''));

          // Map headers to row object
          const rowObj = {};
          headers.forEach((header, idx) => {
            rowObj[header] = values[idx] || '';
          });
          rows.push(rowObj);
        }

        setFileData(rows);
      } catch (err) {
        console.error('File parsing error:', err);
        setError('Falha ao processar o arquivo. Verifique se é uma exportação válida do DocuWare.');
        setFileData(null);
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setError('Erro na leitura do arquivo.');
      setLoading(false);
    };

    // Read as UTF-8
    reader.readAsText(file, 'utf-8');
  };

  // Run KPI Calculations over all rows using current configs
  const computedData = useMemo(() => {
    if (!fileData) return [];
    return fileData.map(row => calculateRowKPIs(row, calendarCountry, customSlas));
  }, [fileData, calendarCountry, customSlas]);

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

    const allHeaders = [...originalHeaders, ...calculatedHeaders];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(';') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerRow = allHeaders.map(escapeCsv).join(';');
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
              className="bg-transparent border-none focus:outline-none text-sm font-semibold cursor-pointer"
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
                <FaSlidersH /> Configuração de SLAs por Atividade
              </h3>
              <button onClick={() => setShowSlaConfig(false)} className="btn btn-sm btn-circle btn-ghost">✕</button>
            </div>
            <p className="text-sm text-base-content/70 mb-4">
              Configure o limite de SLA operacional (em horas úteis) para cada atividade específica. A tabela de transformações irá ler estas regras dinamicamente.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-semibold">GR Cliente: Tomada de Conhecimento (SLA Horas)</span>
                </label>
                <input 
                  type="number" 
                  value={customSlas['WFP.340.16 - MCO - Conhecimento GR Cliente (BFA)::Tomada de Conhecimento']} 
                  onChange={(e) => handleSlaChange('WFP.340.16 - MCO - Conhecimento GR Cliente (BFA)::Tomada de Conhecimento', e.target.value)}
                  className="input input-bordered focus:input-primary"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-semibold">GR Resolvida: Faturação (SLA Horas)</span>
                </label>
                <input 
                  type="number" 
                  value={customSlas['WFP.340.18 - MCO - GR Resolvida::Faturação']} 
                  onChange={(e) => handleSlaChange('WFP.340.18 - MCO - GR Resolvida::Faturação', e.target.value)}
                  className="input input-bordered focus:input-primary"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-semibold">GR Resolvida: Classificação (SLA Horas)</span>
                </label>
                <input 
                  type="number" 
                  value={customSlas['WFP.340.18 - MCO - GR Resolvida::Classificação das Guias']} 
                  onChange={(e) => handleSlaChange('WFP.340.18 - MCO - GR Resolvida::Classificação das Guias', e.target.value)}
                  className="input input-bordered focus:input-primary"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-semibold">GR Resolvida: Contabilização (SLA Horas)</span>
                </label>
                <input 
                  type="number" 
                  value={customSlas['WFP.340.18 - MCO - GR Resolvida::Contabilização']} 
                  onChange={(e) => handleSlaChange('WFP.340.18 - MCO - GR Resolvida::Contabilização', e.target.value)}
                  className="input input-bordered focus:input-primary"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-semibold">SLA Padrão (Default)</span>
                </label>
                <input 
                  type="number" 
                  value={customSlas['Default']} 
                  onChange={(e) => handleSlaChange('Default', e.target.value)}
                  className="input input-bordered focus:input-primary"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Settings Panel */}
      <div className="card bg-base-100 border border-base-200 shadow-xl">
        <div className="card-body p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-end">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-bold">1. Selecione o Armário</span>
              </label>
              <select 
                value={selectedCabinet} 
                onChange={(e) => setSelectedCabinet(e.target.value)}
                className="select select-bordered focus:select-primary text-base"
              >
                {cabinets.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-bold">2. Tipo Documental</span>
              </label>
              <select 
                value={selectedDocType} 
                onChange={(e) => setSelectedDocType(e.target.value)}
                className="select select-bordered focus:select-primary text-base"
              >
                {docTypes.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-bold">3. Carregar Histórico do Workflow (DocuWare Export)</span>
              </label>
              <div className="flex gap-2">
                <label className="flex-1 flex items-center justify-center border-2 border-dashed border-base-300 hover:border-primary rounded-lg cursor-pointer h-12 transition-colors px-4 bg-base-50/50">
                  <input 
                    type="file" 
                    accept=".csv,.prn,.txt" 
                    onChange={handleFileUpload} 
                    className="hidden" 
                  />
                  <div className="flex items-center gap-2 text-sm font-semibold text-base-content/70">
                    <FaUpload className="text-primary" />
                    <span>{fileName ? fileName : 'Escolher arquivo exportação (.prn / .csv)'}</span>
                  </div>
                </label>
              </div>
            </div>
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
      {computedData.length > 0 && metrics && (
        <div className="space-y-8 animate-fade-in-up">
          {/* Action Row */}
          <div className="flex justify-between items-center bg-base-100 p-4 rounded-xl border border-base-200 shadow-md">
            <div className="flex items-center gap-2 text-sm text-base-content/70">
              <FaInfoCircle className="text-info" />
              <span>Dados normalizados com sucesso. Pronto para exportação executiva.</span>
            </div>
            <button 
              onClick={handleExportEnrichedCSV}
              className="btn btn-success text-white gap-2 font-bold shadow-md shadow-success/20 hover:scale-[1.02] transition-transform"
            >
              <FaFileCsv className="text-lg" /> Exportar Workflow Analytics CSV
            </button>
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
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-primary"></span> Distribuição de SLA por Status
              </h3>
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
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-primary"></span> Ranking de Responsáveis (Gargalos)
              </h3>
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
            <div className="p-6 border-b border-base-200">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-primary"></span> Performance Operacional por Atividade
              </h3>
            </div>
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
            <div className="p-6 border-b border-base-200 flex justify-between items-center bg-error/5">
              <h3 className="text-lg font-bold text-error flex items-center gap-2">
                <FaExclamationTriangle /> Lista de Tarefas Críticas (Atraso Inaceitável)
              </h3>
              <span className="badge badge-error text-white font-bold">{criticalTasks.length} alertas</span>
            </div>
            
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
      {!fileData && !loading && (
        <div className="flex flex-col items-center justify-center p-16 bg-base-100 rounded-2xl border border-base-200 shadow-xl text-center space-y-4">
          <div className="p-6 bg-primary/5 text-primary rounded-full animate-pulse">
            <FaFileAlt className="w-16 h-16" />
          </div>
          <h2 className="text-2xl font-bold text-base-content">Nenhum histórico carregado</h2>
          <p className="text-base-content/60 max-w-md text-sm">
            Selecione o armário, o tipo de documento correspondente e faça upload do arquivo `.prn` ou `.csv` exportado do histórico do DocuWare para iniciar a análise.
          </p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-20 space-y-4 bg-base-100 rounded-2xl border border-base-200 shadow-xl">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="font-semibold text-base-content/70">Processando e enriquecendo dados do workflow...</p>
        </div>
      )}
    </div>
  );
}
