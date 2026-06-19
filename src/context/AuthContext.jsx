import { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            try {
                // Setup interceptors for token refresh
                authService.setupAxiosInterceptors();

                const storedUser = authService.getCurrentUser();
                if (storedUser) {
                    setUser(storedUser);
                } else {
                    console.log('🔄 AuthContext: No stored user. Attempting automatic login...');
                    const autoUser = await authService.autoLogin();
                    if (autoUser) {
                        setUser(autoUser);
                    }
                }
            } catch (err) {
                console.error('❌ AuthContext: Init auth failed:', err.message);
            } finally {
                setLoading(false);
            }
        };

        initAuth();
    }, []);

    const login = async (url) => {
        // OAuth login - this will redirect to DocuWare
        await authService.login(url);
    };

    const logout = () => {
        authService.logout();
        setUser(null);
        localStorage.removeItem('docuware_session_start');
    };

    const reloadUser = useCallback(() => {
        const storedUser = authService.getCurrentUser();
        if (storedUser) {
            console.log('🔄 AuthContext: Reloading user from storage...');
            setUser(storedUser);
        } else {
            console.log('⚠️ AuthContext: No user found in storage.');
        }
    }, []);

    return (
        <AuthContext.Provider value={{ user, login, logout, reloadUser, loading, setUser }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
