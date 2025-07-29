import React, { useState } from 'react';
import axios from 'axios';
import UploadForm from './components/UploadForm';
import GrafanaPanel from './components/GrafanaPanel';
import HistoryPanel from './components/HistoryPanel';
import {
  Box, Typography, Button, Divider, List, ListItem, ListItemIcon, ListItemText,
  CircularProgress, Paper
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';

// Statically define the backend URL for the port-forward setup
const backendUrl = 'http://localhost:8000';

function App() {
  const [appId, setAppId] = useState(null);
  const [instrumented, setInstrumented] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [processSteps, setProcessSteps] = useState([]);

  const handleAppReady = (id) => {
    setAppId(id);
    setInstrumented(false);
    setProcessSteps([]);
    setIsLoading(false);
  };

  const handleInstrumentAndRun = async () => {
    if (!appId) return;
    setIsLoading(true);
    setInstrumented(false);
    setProcessSteps([
      { key: 'clone', label: 'Repository cloned', status: 'success' },
      { key: 'instrument', label: 'Instrumenting application...', status: 'loading' },
      { key: 'deploy', label: 'Deploying to Kubernetes...', status: 'pending' }
    ]);

    try {
      await axios.post(
        `${backendUrl}/instrument`,
        { app_id: appId },
        { headers: { 'Content-Type': 'application/json' } }
      );
      setProcessSteps(prev => prev.map(s => s.key === 'instrument' ? {...s, status: 'success', label: 'Instrumentation complete'} : s));
      setProcessSteps(prev => prev.map(s => s.key === 'deploy' ? {...s, status: 'loading'} : s));


      await axios.post(
        `${backendUrl}/run`,
        { app_id: appId },
        { headers: { 'Content-Type': 'application/json' } }
      );
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setProcessSteps(prev => prev.map(s => s.key === 'deploy' ? {...s, status: 'success', label: 'Deployment successful!'} : s));
      setInstrumented(true);

    } catch (err) {
      console.error("Error during instrumentation:", err.response?.data || err.message);
      const errorDetail = err.response?.data?.detail || "An unknown error occurred.";
      setProcessSteps(prev => 
        prev.map(step => 
          step.status === 'loading' 
            ? { ...step, status: 'error', label: `Failed: ${errorDetail}` } 
            : step
        )
      );
      setInstrumented(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      height={'100vh'}
      width={'100vw'}
      display={'flex'}
      sx={{
        background: 'linear-gradient(135deg, #232b5d 0%, #3e6b89 40%, #4fd1c5 100%)',
        overflow: 'hidden',
      }}
    >
      {/* Sidebar */}
      <Box
        width={'19%'}
        display={'flex'}
        flexDirection={'column'}
        pt={'3rem'}
        sx={{
          background: 'linear-gradient(135deg, #232b5d 0%, #3e6b89 100%)',
          boxShadow: 3,
        }}
      >
        <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', flexDirection: 'column' }}>
          <Box sx={{ mb: 1 }}>
            <svg width="125" height="125" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" fill="#4fd1c5" stroke="#fff" strokeWidth="3" />
              <path d="M24 14v10l7 7" stroke="#232b5d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="24" cy="24" r="4" fill="#fff" stroke="#232b5d" strokeWidth="2" />
            </svg>
          </Box>
          <Typography variant="h6" color="#fff" fontWeight={700} letterSpacing={1} sx={{ mb: 0.5 }}>
            TraceAssist
          </Typography>
          <Typography variant="caption" color="#b0bec5" align="center" sx={{ px: 1 }}>
            Automated Observability
          </Typography>
        </Box>
        <Divider sx={{ width: '100%', mb: 2, bgcolor: '#4fd1c5' }} />
      </Box>

      {/* Main Content */}
      <Box
        width={'81vw'}
        flex={1}
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="flex-start"
        pt={2}
        height={'100vh'}
        sx={{ overflowY: 'auto' }}
      >
        <Box
          sx={{
            borderRadius: 2,
            p: appId ? 3 : 4,
            background: 'rgba(255,255,255,0.97)',
            boxShadow: '0 8px 32px rgba(44, 62, 80, 0.13)',
            width: appId ? '95%' : '700px',
            maxWidth: '1200px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            my: 2,
          }}
        >
          <Typography variant="h3" fontWeight={700} gutterBottom align="center" sx={{ background: 'linear-gradient(90deg, #232b5d 0%, #4fd1c5 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', mb: 1 }}>
            TraceAssist Dashboard
          </Typography>
          <Typography variant="subtitle1" color="text.secondary" align="center" sx={{ mb: 3 }}>
            Automated observability for your Kubernetes applications.
          </Typography>

          {!appId && (
            <>
              <UploadForm onAppReady={handleAppReady} backendUrl={backendUrl} />
              <HistoryPanel backendUrl={backendUrl} />
            </>
          )}

          {appId && !instrumented && (
            <Box display="flex" flexDirection="column" alignItems="center" width="100%" mt={1}>
              <Button
                variant="contained"
                size="large"
                startIcon={isLoading ? <CircularProgress size={24} color="inherit" /> : <AutoAwesomeIcon />}
                disabled={isLoading}
                sx={{
                  background: 'linear-gradient(90deg, #232b5d 0%, #4fd1c5 100%)',
                  color: '#fff', fontWeight: 600, px: 4, py: 1.5, borderRadius: 3,
                  textTransform: 'none', fontSize: '1.15rem',
                  '&:disabled': { background: 'grey', color: '#ccc' }
                }}
                onClick={handleInstrumentAndRun}
              >
                {isLoading ? 'Processing...' : 'Instrument & Deploy'}
              </Button>
              
              {processSteps.length > 0 && (
                <Paper elevation={2} variant="outlined" sx={{ mt: 3, p: 1.5, width: '100%', maxWidth: '480px', borderRadius: '8px' }}>
                  <List dense>
                    {processSteps.map((step) => (
                      <ListItem key={step.key} sx={{ py: 0.5 }}>
                        <ListItemIcon sx={{ minWidth: '36px' }}>
                          {step.status === 'loading' && <CircularProgress size={20} />}
                          {step.status === 'success' && <CheckCircleIcon color="success" />}
                          {step.status === 'error' && <ErrorIcon color="error" />}
                          {step.status === 'pending' && <HourglassEmptyIcon color="disabled" />}
                        </ListItemIcon>
                        <ListItemText primary={step.label} primaryTypographyProps={{ variant: 'body2', color: step.status === 'error' ? 'error.main' : 'text.primary' }} />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              )}
            </Box>
          )}

          {instrumented && (
            <Box width="100%" mt={2}>
                <Typography variant="h5" gutterBottom align="center">Deployment Successful!</Typography>
                <Typography variant="body1" color="text.secondary" align="center" sx={{mb: 2}}>View your application's telemetry data in the Grafana dashboard below.</Typography>
                <GrafanaPanel appId={appId} />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default App;
