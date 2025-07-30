import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Typography, Paper, CircularProgress, Alert,
  Grid, Card, CardContent, Chip, LinearProgress, Dialog,
  DialogActions, DialogContent, DialogContentText, DialogTitle, TextField, Divider, ButtonGroup, IconButton
} from '@mui/material';
import { VpnKey, Link as LinkIcon, CheckCircle, Error, HourglassEmpty, RocketLaunch, Update, Schedule, Delete, Refresh, Language } from '@mui/icons-material';
import axios from 'axios';

export default function DeploymentDetail({ backendUrl, deploymentName, onDeploymentUpdate, onDeploymentDeleted }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionInProgress, setActionInProgress] = useState(false);
  
  const [isUndeployModalOpen, setIsUndeployModalOpen] = useState(false);

  // Wrap fetchDetails in useCallback for a stable function reference that doesn't change on re-renders
  const fetchDetails = useCallback(async () => {
    if (!deploymentName) return;
    try {
      setLoading(true);
      setError('');
      const response = await axios.get(`${backendUrl}/deployments/${deploymentName}`);
      setDetails(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch deployment details.');
      if (err.response?.status === 404) {
          onDeploymentDeleted(); // Callback to parent if the resource is gone
      }
    } finally {
      setLoading(false);
    }
  }, [deploymentName, backendUrl, onDeploymentDeleted]);

  // Fetch details when the component mounts or when the selected deployment changes
  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // This is the simplified handler that no longer needs a PAT modal
  const handleInstrumentClick = async () => {
    setActionInProgress(true);
    setError('');
    try {
      // The request body is empty because the backend already has the encrypted token
      await axios.post(`${backendUrl}/deployments/${deploymentName}/instrument`);
      await fetchDetails(); // Manually refresh details after the action
      onDeploymentUpdate(); // Notify the parent component to refresh its list
    } catch (err) {
      setError(err.response?.data?.detail || 'Instrumentation failed.');
    } finally {
      setActionInProgress(false);
    }
  };

  const executeUndeploy = async () => {
    setActionInProgress(true);
    setError('');
    setIsUndeployModalOpen(false);
    try {
      await axios.delete(`${backendUrl}/deployments/${deploymentName}`);
      onDeploymentDeleted(); // Notify parent to clear selection and refresh list
    } catch (err) {
      setError(err.response?.data?.detail || 'Undeploy failed.');
    } finally {
      setActionInProgress(false);
    }
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case 'Created': return { icon: <HourglassEmpty color="info" />, color: 'info' };
      case 'Cloning': case 'Building': case 'Deploying': case 'Undeploying': return { icon: <CircularProgress size={24} color="secondary" />, color: 'secondary' };
      case 'Deployed': return { icon: <CheckCircle color="success" />, color: 'success' };
      case 'Failed': case 'Undeploy Failed': return { icon: <Error color="error" />, color: 'error' };
      case 'Undeployed': return { icon: <Delete color="action" />, color: 'default' };
      default: return { icon: <HourglassEmpty color="disabled" />, color: 'default' };
    }
  };

  if (loading) return <CircularProgress />;
  if (error && !details) return <Alert severity="error">{error}</Alert>;
  if (!details) return <Typography>Please select a deployment to view its details.</Typography>;

  const statusInfo = getStatusInfo(details.status);
  const isActionable = !['Cloning', 'Building', 'Deploying', 'Undeploying'].includes(details.status);

  return (
    <>
      <Paper elevation={3} sx={{ p: 3, borderRadius: 2, width: '100%', borderTop: `4px solid`, borderColor: `${statusInfo.color}.main`, position: 'relative' }}>
        
        <IconButton 
          onClick={fetchDetails} 
          disabled={loading || actionInProgress}
          sx={{ position: 'absolute', top: 8, right: 8 }}
          aria-label="refresh"
        >
          <Refresh />
        </IconButton>

        <Typography variant="h4" gutterBottom fontWeight="bold">{details.deployment_name}</Typography>
        <Divider sx={{ mb: 3 }} />
        
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
                <strong>PAT Required:</strong> 
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

        {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
        
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <ButtonGroup variant="contained" size="large">
            <Button color="secondary" disabled={!isActionable || actionInProgress} startIcon={actionInProgress ? <CircularProgress size={24} color="inherit" /> : <RocketLaunch />} onClick={handleInstrumentClick}>
              Instrument & Deploy
            </Button>
            <Button color="error" disabled={!isActionable || actionInProgress} startIcon={actionInProgress ? <CircularProgress size={24} color="inherit" /> : <Delete />} onClick={() => setIsUndeployModalOpen(true)}>
              Undeploy
            </Button>
          </ButtonGroup>
        </Box>
        {actionInProgress && <LinearProgress color="secondary" sx={{ mt: 2 }} />}
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
