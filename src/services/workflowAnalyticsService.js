import axios from 'axios';

/**
 * Workflow Analytics Service
 * 
 * Interacts with the DocuWare Workflow Analytics API to retrieve detailed
 * audit trails and history for workflows, including completed instances.
 * 
 * Base URL: /DocuWare/Workflow/Analytics/api
 */

const analyticsApi = axios.create({
    baseURL: (import.meta.env.BASE_URL || '/') + 'DocuWare/Workflow/Analytics',
    timeout: 30000,
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
});

// Request Interceptor (Auth)
analyticsApi.interceptors.request.use(
    (config) => {
        const authData = sessionStorage.getItem('docuware_auth');
        let targetUrl = null;

        if (authData) {
            try {
                const parsed = JSON.parse(authData);
                if (parsed.token) {
                    config.headers.Authorization = `Bearer ${parsed.token}`;
                }
                if (parsed.url) {
                    targetUrl = parsed.url;
                }
            } catch (error) {
                console.error('[WorkflowAnalytics] Error parsing auth data:', error);
            }
        }

        // Apply Target URL for Proxy
        if (targetUrl) {
            config.headers['x-target-url'] = targetUrl;
        }

        return config;
    },
    (error) => Promise.reject(error)
);

export const workflowAnalyticsService = {
    /**
     * Get Workflow History for a Document by DocID
     * @param {string} docId 
     * @param {string} cabinetId
     * @returns {Promise<Array>}
     */
    getHistoryByDocId: async (docId, cabinetId) => {
        try {
            console.log(`[WorkflowAnalytics] Fetching history for DocID: ${docId}, Cabinet: ${cabinetId}`);

            // Use the specific Platform endpoint for Document History
            // /DocuWare/Platform/Workflow/Instances/DocumentHistory?fileCabinetId=...&documentId=...

            // Note: We use baseURL '/' to bypass the 'Analytics' base and go straight to Platform via Proxy
            // The Proxy handles /DocuWare/... forwarding

            if (!cabinetId) {
                console.warn('[WorkflowAnalytics] CabinetID missing, cannot fetch specific history.');
                return [];
            }

            const response = await analyticsApi.get(`${import.meta.env.BASE_URL || '/'}DocuWare/Platform/Workflow/Instances/DocumentHistory`, {
                params: {
                    fileCabinetId: cabinetId,
                    documentId: docId
                }
            });

            console.log('[WorkflowAnalytics] History Response:', response.data);

            // The response typically contains "InstanceHistory": [...]
            const instances = response.data.InstanceHistory || response.data || [];

            if (Array.isArray(instances)) {
                console.log(`[WorkflowAnalytics] Found ${instances.length} instances. Fetching details...`);

                // Fetch details for each instance to get actual steps
                const historyPromises = instances.map(async (inst) => {
                    try {
                        // Find the self link or construct it. The JSON had a 'self' link ending in /History
                        const selfLink = (inst.Links || []).find(l => l.Rel === 'self' || l.rel === 'self');
                        let historyUrl = null;

                        if (selfLink && selfLink.href) {
                            historyUrl = selfLink.href;
                            if (historyUrl.startsWith('/DocuWare')) {
                                historyUrl = (import.meta.env.BASE_URL || '/') + historyUrl.substring(1);
                            }
                        } else {
                            // Fallback construction if link missing
                            // /DocuWare/Platform/Workflow/Workflows/{WorkflowId}/Instances/{Id}/History
                            historyUrl = `${import.meta.env.BASE_URL || '/'}DocuWare/Platform/Workflow/Workflows/${inst.WorkflowId}/Instances/${inst.Id}/History`;
                        }

                        if (historyUrl) {
                            console.log(`[WorkflowAnalytics] Fetching details: ${historyUrl}`);
                            const detailResp = await analyticsApi.get(historyUrl);
                            // Attach steps to the instance object, DO NOT flatten yet
                            return {
                                ...inst,
                                HistorySteps: detailResp.data.HistorySteps || detailResp.data || []
                            };
                        }
                    } catch (detailErr) {
                        console.warn(`[WorkflowAnalytics] Failed to fetch details for instance ${inst.Id}`, detailErr);
                        return { ...inst, HistorySteps: [] };
                    }
                    return { ...inst, HistorySteps: [] };
                });

                const instancesWithSteps = await Promise.all(historyPromises);
                return instancesWithSteps;
            }

            return [];

        } catch (error) {
            console.error('[WorkflowAnalytics] Platform History fetch failed:', error);
            throw error;
        }
    }
};
