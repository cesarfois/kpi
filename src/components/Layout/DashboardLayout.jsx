import Header from './Header';

const DashboardLayout = ({ children }) => {
    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            {/* Header */}
            <Header />

            {/* Content Area */}
            <main className="flex-1 p-6 mt-20 overflow-x-hidden">
                <div className="max-w-[1920px] mx-auto animate-fade-in">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default DashboardLayout;
