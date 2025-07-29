import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import CreateDeploymentForm from './components/CreateDeploymentForm';
import DeploymentDetail from './components/DeploymentDetail';
import {
  Box, Typography, Divider, Select, MenuItem, FormControl, InputLabel
} from '@mui/material';

// Statically define the backend URL for the port-forward setup
const backendUrl = 'http://localhost:8000';

function App() {
  const [deployments, setDeployments] = useState([]);
  const [selectedDeployment, setSelectedDeployment] = useState('');
  const [loading, setLoading] = useState(true);

  // Use useCallback to create a stable function reference for fetching data
  const fetchDeployments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${backendUrl}/deployments`);
      setDeployments(response.data);
    } catch (error) { // Corrected syntax here
      console.error("Failed to fetch deployments:", error);
    } finally {
      setLoading(false);
    }
  }, []); // The empty dependency array ensures this function is created only once

  // Fetch deployments when the component first mounts
  useEffect(() => {
    fetchDeployments();
  }, [fetchDeployments]);

  // Handler to refresh the list when a new deployment is created
  const handleDeploymentCreated = () => {
    fetchDeployments();
  };
  
  // Handler to refresh the list when a deployment's status is updated
  const handleDeploymentUpdate = () => {
    fetchDeployments();
  };

  // Handler for when a deployment is deleted
  const handleDeploymentDeleted = () => {
    // Clear the current selection and refresh the list
    setSelectedDeployment('');
    fetchDeployments();
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
            p: 4,
            background: 'rgba(255,255,255,0.97)',
            boxShadow: '0 8px 32px rgba(44, 62, 80, 0.13)',
            width: '90%',
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
          
          <CreateDeploymentForm backendUrl={backendUrl} onDeploymentCreated={handleDeploymentCreated} />

          <Divider sx={{ width: '100%', my: 2 }}>
            <Typography>Manage Existing Deployments</Typography>
          </Divider>

          <FormControl fullWidth sx={{ maxWidth: '600px', mb: 3 }}>
            <InputLabel id="deployment-select-label">Select a Deployment</InputLabel>
            <Select
              labelId="deployment-select-label"
              value={selectedDeployment}
              label="Select a Deployment"
              onChange={(e) => setSelectedDeployment(e.target.value)}
              disabled={loading}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {deployments.map((dep) => (
                <MenuItem key={dep.id} value={dep.deployment_name}>
                  {dep.deployment_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          {selectedDeployment && (
            <DeploymentDetail 
              backendUrl={backendUrl} 
              deploymentName={selectedDeployment}
              onDeploymentUpdate={handleDeploymentUpdate}
              onDeploymentDeleted={handleDeploymentDeleted}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default App;
