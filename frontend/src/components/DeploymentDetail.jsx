import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Button, Typography, CircularProgress, Alert,
  Paper, Grid, List, ListItem, ListItemText, Chip, Divider
} from '@mui/material';
import { PlayCircleOutline, DeleteForever } from '@mui/icons-material';
import GrafanaPanel from './GrafanaPanel';

export default function DeploymentDetail({ backendUrl, deploymentName, onDeploymentUpdate, onDeploymentDeleted }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDetails = useCallback(async () => {
    if (!deploymentName) return;
    try {
      setLoading(true);
      const response = await axios.get(`${backendUrl}/deployments/${deploymentName}`);
      setDetails(response.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch deployment details.');
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, deploymentName]);

  useEffect(() => {
    fetchDetails();
    const interval = setInterval(fetchDetails, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [fetchDetails]);

  const handleAction = async (action) => {
    setActionLoading(true);
    setError('');
    try {
      let response;
      if (action === 'instrument') {
        response = await axios.post(`${backendUrl}/deployments/${deploymentName}/instrument`);
      } else if (action === 'delete') {
        if (window.confirm("Are you sure you want to delete this deployment? This action cannot be undone.")) {
          response = await axios.delete(`${backendUrl}/deployments/${deploymentName}`);
          onDeploymentDeleted();
        } else {
          setActionLoading(false);
          return; 
        }
      }
      onDeploymentUpdate();
    } catch (err)
 {
      setError(err.response?.data?.detail || `Failed to perform action: ${action}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !details) {
    return <CircularProgress />;
  }

  if (error && !details) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!details) {
    return <Typography>Select a deployment to see details.</Typography>;
  }
  
  const getStatusChipColor = (status) => {
    if (status.toLowerCase().includes('failed')) return 'error';
    if (status.toLowerCase().includes('generating') || status.toLowerCase().includes('building') || status.toLowerCase().includes('deploying') || status.toLowerCase().includes('cloning')) return 'warning';
    if (status.toLowerCase() === 'deployed') return 'success';
    return 'info';
  };

  let panelLinks = [];
  if (details.grafana_panel_links) {
    try {
      panelLinks = JSON.parse(details.grafana_panel_links);
    } catch (e) {
      console.error("Failed to parse Grafana panel links:", e);
    }
  }

  return (
    <Paper elevation={3} sx={{ p: 3, borderRadius: 2, width: '100%' }}>
      <Typography variant="h5" gutterBottom fontWeight="bold">
        Details for: {details.deployment_name}
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <List dense>
            <ListItem>
              <ListItemText primaryTypographyProps={{ fontWeight: 'bold' }} primary="Status" />
              <Chip label={details.status} color={getStatusChipColor(details.status)} size="small" />
            </ListItem>
             <Divider component="li" />
            <ListItem>
              <ListItemText primaryTypographyProps={{ fontWeight: 'bold' }} primary="Repository URL" secondary={details.repo_url} />
            </ListItem>
             <Divider component="li" />
            <ListItem>
              <ListItemText primaryTypographyProps={{ fontWeight: 'bold' }} primary="Language" secondary={details.language || 'N/A'} />
            </ListItem>
             <Divider component="li" />
            <ListItem>
                <ListItemText primaryTypographyProps={{ fontWeight: 'bold' }} primary="Push to Git Enabled" secondary={details.push_enabled ? 'Yes' : 'No'} />
            </ListItem>
            <Divider component="li" />
             <ListItem>
              <ListItemText primaryTypographyProps={{ fontWeight: 'bold' }} primary="Created At" secondary={new Date(details.created_at).toLocaleString()} />
            </ListItem>
             <Divider component="li" />
            <ListItem>
              <ListItemText primaryTypographyProps={{ fontWeight: 'bold' }} primary="Last Updated" secondary={details.last_updated ? new Date(details.last_updated).toLocaleString() : 'N/A'} />
            </ListItem>
          </List>
        </Grid>
        <Grid item xs={12} md={5} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PlayCircleOutline />}
            onClick={() => handleAction('instrument')}
            disabled={actionLoading}
          >
            {actionLoading ? 'Processing...' : 'Deploy / Redeploy'}
          </Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<DeleteForever />}
            onClick={() => handleAction('delete')}
            disabled={actionLoading}
          >
            {actionLoading ? 'Deleting...' : 'Delete Deployment'}
          </Button>
        </Grid>
      </Grid>

      {panelLinks.length > 0 && (
        <Box mt={4}>
          <Typography variant="h6" gutterBottom fontWeight="bold">
            Live Application Metrics
          </Typography>
          <Grid container spacing={2}>
            {panelLinks.map((link, index) => (
              <Grid item xs={12} md={6} key={index}>
                <GrafanaPanel src={link} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </Paper>
  );
}
