import { useState, useEffect } from 'react';
import { docuwareService } from '../../services/docuwareService';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorMessage from '../Common/ErrorMessage';
import { FaSearch } from 'react-icons/fa';

const SearchForm = ({ onSearch, onLog, totalCount = 0, onCabinetChange, onFilterChange, showSearchButton = true }) => {
    // Utility functions for date initialization
    const getPastDateStr = (daysAgo) => {
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        return d.toISOString().split('T')[0];
    };
    const getTodayStr = () => {
        return new Date().toISOString().split('T')[0];
    };

    // --- State ---
    const [cabinets, setCabinets] = useState([]);
    const [selectedCabinet, setSelectedCabinet] = useState('');
    const [fields, setFields] = useState([]);
    const [allFields, setAllFields] = useState([]);

    // Selection fields state
    const [docTypeFieldName, setDocTypeFieldName] = useState('');
    const [docTypeOptions, setDocTypeOptions] = useState([]);
    const [selectedDocType, setSelectedDocType] = useState('');

    // Date range filter state
    const [selectedDateField, setSelectedDateField] = useState('DWStoreDateTime');
    const [customDateField, setCustomDateField] = useState(''); // Stores the custom "Data do Documento" field name
    const [startDate, setStartDate] = useState(getPastDateStr(30));
    const [endDate, setEndDate] = useState(getTodayStr());

    const [loading, setLoading] = useState(false);
    const [loadingDocTypes, setLoadingDocTypes] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchCabinets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (selectedCabinet) {
            fetchFieldsAndDocTypes(selectedCabinet);
            if (onCabinetChange) {
                const cabinet = cabinets.find(c => c.Id === selectedCabinet);
                onCabinetChange(selectedCabinet, cabinet ? cabinet.Name : '');
            }
        } else {
            setFields([]);
            setAllFields([]);
            setDocTypeFieldName('');
            setDocTypeOptions([]);
            setSelectedDocType('');
        }
    }, [selectedCabinet, cabinets]);

    // Construct and propagate filters automatically when selection changes
    useEffect(() => {
        const newFilters = [];

        // 1. Document Type Filter
        if (selectedDocType && docTypeFieldName) {
            newFilters.push({
                fieldName: docTypeFieldName,
                value: selectedDocType
            });
        }

        // 2. Date Range Filter
        if (selectedDateField && (startDate || endDate)) {
            newFilters.push({
                fieldName: selectedDateField,
                value: [startDate, endDate]
            });
        }

        if (onFilterChange) {
            onFilterChange(newFilters);
        }
    }, [selectedDocType, docTypeFieldName, selectedDateField, startDate, endDate, onFilterChange]);

    const fetchCabinets = async () => {
        try {
            setLoading(true);
            onLog('Fetching file cabinets...');
            const data = await docuwareService.getCabinets();
            const sortedData = data.sort((a, b) => a.Name.localeCompare(b.Name));
            setCabinets(sortedData);
            onLog(`Found ${data.length} file cabinets`);

            // Restore selection from localStorage
            const storedId = localStorage.getItem('selectedCabinetId');
            if (storedId) {
                const isValid = sortedData.some(c => c.Id === storedId);
                if (isValid) {
                    setSelectedCabinet(storedId);
                } else {
                    localStorage.removeItem('selectedCabinetId');
                }
            }
        } catch (err) {
            console.error('Cabinet fetch error:', err);
            setError('Failed to load cabinets: ' + err.message);
            onLog('Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchFieldsAndDocTypes = async (cabinetId) => {
        try {
            setLoadingDocTypes(true);
            setError('');
            onLog(`Fetching fields for cabinet ${cabinetId}...`);
            const data = await docuwareService.getCabinetFields(cabinetId);
            setAllFields(data || []);

            // User visible fields
            const userFields = (data || [])
                .filter(f => !f.SystemField && f.DWFieldType !== 'Memo')
                .sort((a, b) => (a.DisplayName || a.FieldName).localeCompare(b.DisplayName || b.FieldName));
            setFields(userFields);

            // 1. Identify Document Type Field
            const preferredMatch = ['tipo de documento', 'document_type', 'tipo_doc', 'tipo de doc', 'tipo_documento'];
            const docTypeField = userFields.find(f => {
                const label = (f.DisplayName || f.FieldName || '').toLowerCase();
                const dbName = (f.DBFieldName || '').toLowerCase();
                return preferredMatch.some(p => label === p || label.includes(p) || dbName === p || dbName.includes(p));
            });

            // 2. Identify Document Date Field
            const dateMatch = ['data do documento', 'document_date', 'data_doc', 'data_documento', 'data'];
            const docDateField = userFields.find(f => {
                const label = (f.DisplayName || f.FieldName || '').toLowerCase();
                const dbName = (f.DBFieldName || '').toLowerCase();
                return dateMatch.some(p => label === p || label.includes(p) || dbName === p || dbName.includes(p)) && f.DWFieldType === 'Date';
            });

            if (docDateField) {
                setCustomDateField(docDateField.DBFieldName);
            } else {
                setCustomDateField('DWDocumentDate'); // standard system fallback
            }

            if (docTypeField) {
                const dbFieldName = docTypeField.DBFieldName;
                setDocTypeFieldName(dbFieldName);
                onLog(`Loading unique values for "${docTypeField.DisplayName || dbFieldName}"...`);
                
                const values = await docuwareService.getSelectList(cabinetId, dbFieldName);
                const sortedValues = values.sort((a, b) =>
                    String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
                );
                setDocTypeOptions(sortedValues);
                onLog(`Loaded ${sortedValues.length} document types.`);
            } else {
                setDocTypeFieldName('');
                setDocTypeOptions([]);
                onLog('No standard document type field found in cabinet.');
            }
        } catch (err) {
            setError('Failed to load cabinet fields/options: ' + err.message);
            onLog('Error: ' + err.message);
        } finally {
            setLoadingDocTypes(false);
        }
    };

    const handleSearch = () => {
        if (!selectedCabinet) {
            setError('Please select a file cabinet');
            return;
        }

        const validFilters = [];
        if (selectedDocType && docTypeFieldName) {
            validFilters.push({ fieldName: docTypeFieldName, value: selectedDocType });
        }
        if (selectedDateField && (startDate || endDate)) {
            validFilters.push({ fieldName: selectedDateField, value: [startDate, endDate] });
        }

        onLog(`Searching in cabinet ${selectedCabinet} with ${validFilters.length} filters...`);
        onSearch(selectedCabinet, validFilters, allFields, 999999);
    };

    if (loading) return <LoadingSpinner />;

    return (
        <div className="card bg-base-100 shadow-md border border-base-200">
            <div className="card-body p-6">
                {error && <ErrorMessage message={error} />}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 1. Selecione o Armário */}
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text font-semibold text-gray-700">1. Selecione o Armário</span>
                        </label>
                        <select
                            className="select select-bordered w-full bg-white text-gray-900 border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20"
                            value={selectedCabinet}
                            onChange={(e) => {
                                const newValue = e.target.value;
                                setSelectedCabinet(newValue);
                                setSelectedDocType(''); // Reset doc type

                                if (newValue) {
                                    localStorage.setItem('selectedCabinetId', newValue);
                                } else {
                                    localStorage.removeItem('selectedCabinetId');
                                }
                            }}
                        >
                            <option value="">Selecione o armário...</option>
                            {cabinets.map((cab) => (
                                <option key={cab.Id} value={cab.Id}>
                                    {cab.Name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 2. Tipo Documental */}
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text font-semibold text-gray-700">2. Tipo Documental</span>
                        </label>
                        {loadingDocTypes ? (
                            <div className="flex items-center gap-2 h-[3rem] px-3 border border-gray-200 rounded-lg bg-gray-50">
                                <span className="loading loading-spinner loading-xs text-primary"></span>
                                <span className="text-xs text-gray-500">Buscando tipos documentais...</span>
                            </div>
                        ) : (
                            <select
                                className="select select-bordered w-full bg-white text-gray-900 border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20"
                                value={selectedDocType}
                                onChange={(e) => setSelectedDocType(e.target.value)}
                                disabled={!selectedCabinet || docTypeOptions.length === 0}
                            >
                                <option value="">Todos os tipos documentais</option>
                                {docTypeOptions.map((opt, i) => (
                                    <option key={i} value={opt}>
                                        {opt}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                {/* 3. Filtro de Data */}
                {selectedCabinet && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200/60">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Date Field Selector */}
                            <div className="form-control">
                                <label className="label py-1">
                                    <span className="label-text font-semibold text-xs text-gray-600">Campo de Data</span>
                                </label>
                                <select
                                    className="select select-bordered select-sm w-full bg-white text-gray-900"
                                    value={selectedDateField}
                                    onChange={(e) => setSelectedDateField(e.target.value)}
                                >
                                    <option value="DWStoreDateTime">Data Store (Armazenamento)</option>
                                    <option value={customDateField}>Data do Documento</option>
                                </select>
                            </div>

                            {/* De (Start Date) */}
                            <div className="form-control">
                                <label className="label py-1">
                                    <span className="label-text font-semibold text-xs text-gray-600">De (Início)</span>
                                </label>
                                <input
                                    type="date"
                                    className="input input-bordered input-sm w-full bg-white text-gray-900"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                />
                            </div>

                            {/* Até (End Date) */}
                            <div className="form-control">
                                <label className="label py-1">
                                    <span className="label-text font-semibold text-xs text-gray-600">Até (Fim)</span>
                                </label>
                                <input
                                    type="date"
                                    className="input input-bordered input-sm w-full bg-white text-gray-900"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Bottom Stats and Search Action */}
                <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-200/60">
                    <div>
                        {selectedCabinet && (
                            <div className="alert alert-info py-1.5 px-4 shadow-sm inline-flex items-center gap-2 rounded-lg bg-[#00bfff]/10 text-[#0088cc] border border-[#00bfff]/20">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span className="text-xs font-semibold">Total docs no Armário: <span className="font-bold">{totalCount}</span></span>
                            </div>
                        )}
                    </div>

                    {showSearchButton && (
                        <button
                            className="btn btn-primary btn-sm gap-2 text-white bg-indigo-600 hover:bg-indigo-700 border-none px-6 py-2 h-auto"
                            onClick={handleSearch}
                            disabled={loadingDocTypes || !selectedCabinet}
                        >
                            <FaSearch className="text-xs" /> Buscar Documentos
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SearchForm;
