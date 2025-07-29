import React, { useState } from 'react';
import {
  Box, Button, TextField, CircularProgress, Typography,
  IconButton, InputAdornment, Paper, Alert
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import axios from 'axios';

export default function CreateDeploymentForm({ backendUrl, onDeploymentCreated }) {
  const [repoUrl, setRepoUrl] = useState('');
  const [patToken, setPatToken] = useState('');
  const [deploymentName, setDeploymentName] = useState('');
  const [showPatToken, setShowPatToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await axios.post(
        `${backendUrl}/deployments`,
        {
          repo_url: repoUrl,
          pat_token: patToken,
          deployment_name: deploymentName
        }
      );
      setSuccess(`Deployment '${response.data.deployment_name}' created successfully!`);
      // Clear the form
      setRepoUrl('');
      setPatToken('');
      setDeploymentName('');
      // Notify the parent component to refresh the list
      onDeploymentCreated();
    } catch (err) {
      const errorMessage = err.response?.data?.detail || 'Failed to create deployment.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 3, borderRadius: 2, width: '100%', maxWidth: '600px', mb: 4 }}>
      <Typography variant="h5" gutterBottom align="center" fontWeight="bold">
        Create New Deployment
      </Typography>
      <Box component="form" onSubmit={handleSubmit} display="flex" flexDirection="column" gap={2.5}>
        <TextField
          label="Custom Deployment Name"
          placeholder="my-production-api"
          value={deploymentName}
          onChange={(e) => setDeploymentName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          required
          fullWidth
          variant="outlined"
          helperText="A unique name for your application. Lowercase alphanumeric and '-' only."
        />
        <TextField
          label="GitHub Repository URL"
          placeholder="https://github.com/user/repo.git"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          required
          fullWidth
          variant="outlined"
        />
        <TextField
          type={showPatToken ? 'text' : 'password'}
          label="GitHub PAT (Optional for private repos)"
          value={patToken}
          onChange={(e) => setPatToken(e.target.value)}
          fullWidth
          variant="outlined"
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => setShowPatToken(!showPatToken)} edge="end">
                  {showPatToken ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mt: 1 }}>{success}</Alert>}

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={loading || !repoUrl || !deploymentName}
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <AddCircleOutlineIcon />}
          sx={{ mt: 2, py: 1.5, fontWeight: 'bold' }}
        >
          {loading ? 'Creating...' : 'Create Deployment'}
        </Button>
      </Box>
    </Paper>
  );
}
