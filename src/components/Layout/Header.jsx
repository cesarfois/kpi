import { FaHistory, FaArrowLeft, FaSync } from 'react-icons/fa';

const Header = () => {
    const handleBackToPortal = () => {
        window.location.href = '/';
    };

    const handleRefresh = () => {
        window.location.reload();
    };

    return (
        <header className="fixed top-0 left-0 right-0 z-20 bg-white shadow-sm border-b border-gray-200 h-20 px-6 flex items-center justify-between">
            {/* Left side: Icon, Title & Subtitle */}
            <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                    <FaHistory className="w-6 h-6" />
                </div>
                <div className="flex flex-col">
                    <h1 className="text-xl font-bold text-slate-800 leading-tight">
                        Workflow KPI Analytics
                    </h1>
                    <p className="text-xs text-slate-500 font-medium">
                        Análise operacional inteligente, indicadores de SLA e exportação enriquecida para workflows DocuWare.
                    </p>
                </div>
            </div>

            {/* Right side: Action Buttons */}
            <div className="flex items-center gap-3">
                <button
                    onClick={handleBackToPortal}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-sm transition-all cursor-pointer"
                >
                    <FaArrowLeft className="text-xs" />
                    <span>Voltar ao Portal</span>
                </button>

                <button
                    onClick={handleRefresh}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 rounded-lg shadow-sm transition-all cursor-pointer"
                >
                    <FaSync className="text-xs" />
                    <span>Atualizar</span>
                </button>
            </div>
        </header>
    );
};

export default Header;
