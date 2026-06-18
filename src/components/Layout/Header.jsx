import { FaBars, FaSignOutAlt, FaUserCircle } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';

const Header = ({ isSidebarCollapsed, toggleSidebar }) => {
    const { user, logout } = useAuth();

    return (
        <header className={`
            fixed top-0 right-0 z-20 bg-white shadow-sm border-b border-gray-100 h-16
            transition-all duration-300 ease-in-out flex items-center justify-between px-6
            ${isSidebarCollapsed ? 'left-20' : 'left-64'}
        `}>
            {/* Left: Title/Brand Only */}
            <div className="flex items-center gap-4 pl-4">
                {/* Brand Logo (Image) */}
                <div className="flex items-center">
                    <img
                        src="/logo-rcs-vision.png"
                        alt="RCS Vision"
                        className="h-12 w-auto object-contain"
                    />
                </div>
            </div>

            {/* Right: User User & Actions */}
            <div className="flex items-center gap-4">
                {/* Session Timer Removed */}

                <div className="flex items-center gap-3 px-4 py-1.5 rounded-full bg-gray-50 border border-gray-200">
                    <FaUserCircle className="text-gray-400 text-xl" />
                    <div className="flex flex-col text-right hidden sm:flex">
                        <span className="text-sm font-medium text-gray-700 leading-none">
                            {user?.username || 'Usuário'}
                        </span>
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                            {user?.role || 'Admin'}
                        </span>
                    </div>
                </div>

                <button
                    onClick={logout}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Sair do Sistema"
                >
                    <FaSignOutAlt />
                    <span className="hidden sm:inline">Sair</span>
                </button>
            </div>
        </header>
    );
};

export default Header;
