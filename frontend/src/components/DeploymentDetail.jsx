import React, { useState, useEffect } from 'react';
import {
  Box, Button, Typography, Paper, CircularProgress, Alert,
  Grid, Card, CardContent, Chip, LinearProgress, Dialog,
  DialogActions, DialogContent, DialogContentText, DialogTitle, TextField, Divider
} from '@mui/material';
import { VpnKey, Link as LinkIcon, CheckCircle, Error, HourglassEmpty, RocketLaunch, Update, Schedule } from '@mui/icons-material';
import axios from 'axios';

export default function DeploymentDetail({ backendUrl, deploymentName, onDeploymentUpdate }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [instrumenting, setInstrumenting] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tempPatToken, setTempPatToken] = useState('');

  useEffect(() => {
    const fetchDetails = async () => {
      if (!deploymentName) return;
      try {
        setLoading(true);
        setError('');
        const response = await axios.get(`${backendUrl}/deployments/${deploymentName}`);
        setDetails(response.data);
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to fetch deployment details.');
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
    const interval = setInterval(fetchDetails, 5000); // Poll for status updates
    return () => clearInterval(interval);
  }, [deploymentName, backendUrl]);

  const handleInstrumentClick = () => {
    if (details?.pat_token_provided) {
      setIsModalOpen(true);
    } else {
      executeInstrument();
    }
  };

  const executeInstrument = async (token = null) => {
    setInstrumenting(true);
    setError('');
    setIsModalOpen(false);

    try {
      await axios.post(
        `${backendUrl}/deployments/${deploymentName}/instrument`,
        { pat_token: token }
      );
      onDeploymentUpdate();
    } catch (err) {
      setError(err.response?.data?.detail || 'Instrumentation failed.');
    } finally {
      setInstrumenting(false);
      setTempPatToken('');
    }
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case 'Cloned': return { icon: <HourglassEmpty color="info" />, color: 'info', text: 'Ready to Deploy' };
      case 'Building':
      case 'Cloning':
      case 'Deploying': return { icon: <CircularProgress size={24} color="secondary" />, color: 'secondary', text: 'In Progress...' };
      case 'Deployed': return { icon: <CheckCircle color="success" />, color: 'success', text: 'Successfully Deployed' };
      case 'Failed': return { icon: <Error color="error" />, color: 'error', text: 'Deployment Failed' };
      default: return { icon: <HourglassEmpty color="disabled" />, color: 'default', text: 'Unknown' };
    }
  };

  if (loading) return <CircularProgress />;
  if (error && !details) return <Alert severity="error">{error}</Alert>;
  if (!details) return <Typography>Please select a deployment to view its details.</Typography>;

  const statusInfo = getStatusInfo(details.status);

  return (
    <>
      <Paper elevation={3} sx={{ p: 3, borderRadius: 2, width: '100%', borderTop: `4px solid`, borderColor: `${statusInfo.color}.main` }}>
        <Typography variant="h4" gutterBottom fontWeight="bold">{details.deployment_name}</Typography>
        <Divider sx={{ mb: 3 }} />
        
        <Grid container spacing={3}>
          {/* --- Deployment Details --- */}
          <Grid item xs={12} md={8}>
            <Typography variant="h6" gutterBottom>Details</Typography>
            <Card variant="outlined">
              <CardContent>
                <Typography sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <LinkIcon color="action" /> 
                  <strong>Repository URL:</strong>
                  <Typography variant="body2" component="a" href={details.repo_url} target="_blank" rel="noopener noreferrer">
                    {details.repo_url}
                  </Typography>
                </Typography>
                <Typography sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <VpnKey color="action" />
                  <strong>PAT Required:</strong> 
                  <Chip 
                    label={details.pat_token_provided ? "Yes" : "No"} 
                    color={details.pat_token_provided ? "info" : "default"} 
                    size="small" 
                  />
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* --- Status & History --- */}
          <Grid item xs={12} md={4}>
            <Typography variant="h6" gutterBottom>Status</Typography>
            <Card variant="outlined">
              <CardContent>
                <Typography sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  {statusInfo.icon}
                  <strong>Current Status:</strong> 
                  <Chip label={details.status} color={statusInfo.color} />
                </Typography>
                <Typography sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Schedule color="action" /> 
                  <strong>Created:</strong>
                  <Typography variant="body2">{new Date(details.created_at).toLocaleString()}</Typography>
                </Typography>
                {details.last_updated && (
                  <Typography sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Update color="action" /> 
                    <strong>Last Update:</strong>
                    <Typography variant="body2">{new Date(details.last_updated).toLocaleString()}</Typography>
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
        
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button
            variant="contained"
            size="large"
            color="secondary"
            disabled={instrumenting || ['Building', 'Cloning', 'Deploying'].includes(details.status)}
            startIcon={instrumenting ? <CircularProgress size={24} color="inherit" /> : <RocketLaunch />}
            onClick={handleInstrumentClick}
            sx={{ py: 1.5, px: 4, fontWeight: 'bold' }}
          >
            {instrumenting ? 'Processing...' : 'Instrument & Deploy'}
          </Button>
        </Box>
        {(instrumenting || ['Building', 'Cloning', 'Deploying'].includes(details.status)) && <LinearProgress color="secondary" sx={{ mt: 2 }} />}
      </Paper>

      {/* PAT Confirmation Modal */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <DialogTitle>Confirm Private Repository Access</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This deployment requires a GitHub Personal Access Token to clone. Please re-enter your token to proceed.
          </DialogContentText>
          <TextField
            autoFocus margin="dense" label="GitHub PAT" type="password"
            fullWidth variant="standard" value={tempPatToken}
            onChange={(e) => setTempPatToken(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsModalOpen(false)}>Cancel</Button>
          <Button onClick={() => executeInstrument(tempPatToken)} variant="contained">Confirm & Deploy</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
