import React, { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  CircularProgress,
  Typography,
  IconButton,
  InputAdornment
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import axios from 'axios';

export default function UploadForm({ onAppReady, backendUrl }) {
  const [repoUrl, setRepoUrl] = useState('');
  const [patToken, setPatToken] = useState('');
  const [deploymentName, setDeploymentName] = useState('');
  const [showPatToken, setShowPatToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // --- FIX: Use the full backend URL passed in as a prop ---
      const res = await axios.post(
        `${backendUrl}/clone`,
        {
          repo_url: repoUrl,
          pat_token: patToken,
          deployment_name: deploymentName
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
      const { app_id } = res.data;
      onAppReady(app_id);
    } catch (err) {
      const errorMessage = err.response?.data?.detail || 'Failed to clone repository. Check console for details.';
      console.error(err.response?.data || err.message);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      display="flex"
      flexDirection="column"
      gap={2.5}
      width="100%"
      maxWidth="600px"
      mx="auto"
    >
      <TextField
        label="Custom Deployment Name"
        placeholder="my-cool-app"
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
        label="GitHub PAT (Optional)"
        placeholder="Enter token for private repositories"
        value={patToken}
        onChange={(e) => setPatToken(e.target.value)}
        fullWidth
        variant="outlined"
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                aria-label="toggle token visibility"
                onClick={() => setShowPatToken(!showPatToken)}
                onMouseDown={(e) => e.preventDefault()}
                edge="end"
              >
                {showPatToken ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
      
      {error && (
        <Typography color="error" variant="body2" align="center" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}

      <Button
        type="submit"
        variant="contained"
        color="primary"
        size="large"
        disabled={loading || !repoUrl || !deploymentName}
        startIcon={loading && <CircularProgress size={20} color="inherit" />}
        sx={{ mt: 2, py: 1.5, fontWeight: 'bold' }}
      >
        {loading ? 'Cloning...' : 'Clone Repository'}
      </Button>
    </Box>
  );
}
