import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Typography, Paper, CircularProgress, Alert,
  Grid, Card, CardContent, Chip, LinearProgress, Dialog,
  DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, ButtonGroup, IconButton,
  Step, StepLabel, Stepper
} from '@mui/material';
import { VpnKey, Link as LinkIcon, CheckCircle, Error, HourglassEmpty, RocketLaunch, Update, Schedule, Delete, Refresh, Language, CloudUpload, GitHub, Build, SyncProblem } from '@mui/icons-material';
import axios from 'axios';

export default function DeploymentDetail({ backendUrl, deploymentName, onDeploymentUpdate, onDeploymentDeleted }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isUndeployModalOpen, setIsUndeployModalOpen] = useState(false);
  const [instrumentationWarning, setInstrumentationWarning] = useState('');

  const fetchDetails = useCallback(async () => {
    if (!deploymentName) return;
    try {
      if (!details) setLoading(true);
      setError('');
      const response = await axios.get(`${backendUrl}/deployments/${deploymentName}`);
      setDetails(response.data);

      if (response.data.status === "Manifests already instrumented.") {
        setInstrumentationWarning("Otel instrumentation for traceassist are already present");
      } else {
        setInstrumentationWarning("");
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch deployment details.');
      if (err.response?.status === 404) {
          onDeploymentDeleted();
      }
    } finally {
      setLoading(false);
    }
  }, [deploymentName, backendUrl, onDeploymentDeleted, details]);

  useEffect(() => {
    if (deploymentName) {
      fetchDetails();
    }
  }, [deploymentName]);

  useEffect(() => {
    const isInProgress = details && (details.status.includes('...') || details.status.includes('ing'));
    if (isInProgress) {
      const interval = setInterval(() => {
        fetchDetails();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [details, fetchDetails]);

  const handleInstrumentClick = async () => {
    setError('');
    setInstrumentationWarning('');
    try {
      await axios.post(`${backendUrl}/deployments/${deploymentName}/instrument`);
      fetchDetails();
      onDeploymentUpdate();
    } catch (err) {
      setError(err.response?.data?.detail || 'Instrumentation failed.');
    }
  };
  
  const executeUndeploy = async () => {
    try {
      await axios.delete(`${backendUrl}/deployments/${deploymentName}`);
      onDeploymentDeleted();
    } catch (err) {
      setError(err.response?.data?.detail || 'Undeploy failed.');
    }
  };

  const getStatusInfo = (status) => {
    const statusMap = {
        'Created': { icon: <HourglassEmpty color="info" />, color: 'info', progress: 0, step: 0 },
        'Cloning repository...': { icon: <GitHub color="secondary" />, color: 'secondary', progress: 15, step: 1 },
        'Building Docker image...': { icon: <Build color="secondary" />, color: 'secondary', progress: 30, step: 2 },
        'Analyzing Kubernetes manifests...': { icon: <CircularProgress size={24} color="secondary" />, color: 'secondary', progress: 45, step: 3 },
        'Pushing manifest changes to Git...': { icon: <GitHub color="secondary" />, color: 'secondary', progress: 60, step: 4, pushing: true },
        'Manifests already instrumented.': { icon: <CheckCircle color="info" />, color: 'info', progress: 75, step: 4, noPush: true },
        'Proceeding without pushing changes to Git.': { icon: <SyncProblem color="warning" />, color: 'warning', progress: 75, step: 4, noPush: true },
        'Deploying to Kubernetes...': { icon: <CloudUpload color="secondary" />, color: 'secondary', progress: 85, step: 5 },
        'Deployed': { icon: <CheckCircle color="success" />, color: 'success', progress: 100, step: 6 },
        'Failed': { icon: <Error color="error" />, color: 'error', progress: 100, step: -1 },
        'Undeploy Failed': { icon: <Error color="error" />, color: 'error', progress: 100, step: -1 },
        'Undeploying': { icon: <CircularProgress size={24} color="warning" />, color: 'warning', progress: 50, step: -1 },
    };
    return statusMap[status] || { icon: <HourglassEmpty color="disabled" />, color: 'default', progress: 0, step: -1 };
  };

  if (loading) return <CircularProgress />;
  if (error && !details) return <Alert severity="error">{error}</Alert>;
  if (!details) return <Typography>Please select a deployment to view its details.</Typography>;

  const statusInfo = getStatusInfo(details.status);
  const isInProgress = details.status.includes('...') || details.status.includes('ing');

  const deploymentSteps = [
    'Created', 'Cloning', 'Building Image', 'Instrumenting', 'Pushing Code', 'Deploying', 'Deployed'
  ];

  return (
    <>
      <Paper elevation={3} sx={{ p: 3, borderRadius: 2, width: '100%', borderTop: `4px solid`, borderColor: `${statusInfo.color}.main`, position: 'relative' }}>
        
        <IconButton onClick={fetchDetails} disabled={loading || isInProgress} sx={{ position: 'absolute', top: 8, right: 8 }} aria-label="refresh">
          <Refresh />
        </IconButton>

        <Typography variant="h4" gutterBottom fontWeight="bold">{details.deployment_name}</Typography>
        <Divider sx={{ mb: 3 }} />
        
        {/* ** THIS IS THE FIX ** - Restored the details display grid */}
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Typography variant="h6" gutterBottom>Details</Typography>
            <Card variant="outlined"><CardContent>
              <Typography sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <LinkIcon color="action" /> 
                <strong>Repository URL:</strong>
                <Typography variant="body2" component="a" href={details.repo_url} target="_blank" rel="noopener noreferrer">{details.repo_url}</Typography>
              </Typography>
              <Typography sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <VpnKey color="action" /> 
                <strong>PAT Stored:</strong> 
                <Chip label={details.encrypted_pat_token ? "Yes" : "No"} color={details.encrypted_pat_token ? "info" : "default"} size="small" />
              </Typography>
              <Typography sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Language color="action" />
                <strong>Detected Language:</strong> 
                <Chip label={details.language || "Unknown"} color="primary" variant="outlined" size="small" />
              </Typography>
            </CardContent></Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="h6" gutterBottom>Status</Typography>
            <Card variant="outlined"><CardContent>
              <Typography sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                {statusInfo.icon} <strong>Current Status:</strong> <Chip label={details.status} color={statusInfo.color} />
              </Typography>
              <Typography sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Schedule color="action" /> <strong>Created:</strong>
                <Typography variant="body2">{new Date(details.created_at).toLocaleString()}</Typography>
              </Typography>
              {details.last_updated && (
                <Typography sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Update color="action" /> <strong>Last Update:</strong>
                  <Typography variant="body2">{new Date(details.last_updated).toLocaleString()}</Typography>
                </Typography>
              )}
            </CardContent></Card>
          </Grid>
        </Grid>

        <Box sx={{ width: '100%', mt: 4 }}>
          <Typography variant="h6" gutterBottom>Deployment Progress</Typography>
          <Stepper activeStep={statusInfo.step} alternativeLabel>
            {deploymentSteps.map((label, index) => {
              const stepProps = {};
              if (label === 'Pushing Code' && statusInfo.noPush) {
                  stepProps.icon = <SyncProblem color="warning" />;
              }
              if (statusInfo.step === -1 && statusInfo.step > index) {
                  stepProps.error = true;
              }
              return (
              <Step key={label} {...stepProps}>
                <StepLabel>{label}</StepLabel>
              </Step>
            )})}
          </Stepper>
          {isInProgress && <LinearProgress color="secondary" variant="determinate" value={statusInfo.progress} sx={{ mt: 2 }} />}
        </Box>

        {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
        {instrumentationWarning && <Alert severity="warning" sx={{ my: 2 }}>{instrumentationWarning}</Alert>}
        
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <ButtonGroup variant="contained" size="large">
            <Button color="secondary" disabled={isInProgress} startIcon={isInProgress ? <CircularProgress size={24} color="inherit" /> : <RocketLaunch />} onClick={handleInstrumentClick}>
              Instrument & Deploy
            </Button>
            <Button color="error" disabled={isInProgress} startIcon={isInProgress ? <CircularProgress size={24} color="inherit" /> : <Delete />} onClick={() => setIsUndeployModalOpen(true)}>
              Undeploy
            </Button>
          </ButtonGroup>
        </Box>
      </Paper>
      
      <Dialog open={isUndeployModalOpen} onClose={() => setIsUndeployModalOpen(false)}>
        <DialogTitle>Confirm Undeploy</DialogTitle>
        <DialogContent>
          <DialogContentText>Are you sure you want to undeploy "{deploymentName}"? This will delete the application from Kubernetes and remove its record.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsUndeployModalOpen(false)}>Cancel</Button>
          <Button onClick={executeUndeploy} variant="contained" color="error">Confirm Undeploy</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}