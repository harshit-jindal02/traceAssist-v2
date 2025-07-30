import React, { useState } from 'react';
import {
  Box, Button, TextField, CircularProgress, Typography,
  IconButton, InputAdornment, Paper, Alert, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle
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

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  const resetForm = () => {
    setRepoUrl('');
    setPatToken('');
    setDeploymentName('');
    setSuccess('');
    setError('');
    setAnalysisResult(null);
  };

  const handleInitialSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await axios.post(`${backendUrl}/deployments/analyze`, { repo_url: repoUrl });
      const analysis = response.data;
      setAnalysisResult(analysis);

      // Case 1: Private repo, requires a token.
      if (!analysis.is_public && !patToken) {
        setError("This is a private repository. A PAT token is required.");
        return;
      }
      
      // Case 2: Public repo, but needs changes. Open confirmation modal.
      if (analysis.is_public && analysis.push_required) {
        setConfirmModalOpen(true);
      } else {
        // Case 3: Public repo with no changes needed, OR private repo with token already provided.
        // The backend will ignore the PAT for the public/no-changes case.
        handleFinalSubmit();
      }

    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to analyze repository.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalSubmit = async (tokenOverride = null) => {
    setLoading(true);
    setError('');
    setConfirmModalOpen(false);

    const finalPatToken = tokenOverride !== null ? tokenOverride : patToken;

    try {
      await axios.post(
        `${backendUrl}/deployments`,
        { repo_url: repoUrl, deployment_name: deploymentName, pat_token: finalPatToken }
      );
      setSuccess(`Deployment '${deploymentName}' created successfully!`);
      resetForm();
      onDeploymentCreated();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create deployment.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <>
      <Paper elevation={3} sx={{ p: 3, borderRadius: 2, width: '100%', maxWidth: '600px', mb: 4 }}>
        <Typography variant="h5" gutterBottom align="center" fontWeight="bold">
          Create New Deployment
        </Typography>
        <Box component="form" onSubmit={handleInitialSubmit} display="flex" flexDirection="column" gap={2.5}>
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
            label="GitHub PAT (Optional for public repos)"
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
          {analysisResult && analysisResult.is_public && !analysisResult.push_required && (
            <Alert severity="info" sx={{ mt: 1 }}>
              This public repository's manifests are already instrumented. No PAT token is required to proceed.
            </Alert>
          )}

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={loading || !repoUrl || !deploymentName}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <AddCircleOutlineIcon />}
            sx={{ mt: 2, py: 1.5, fontWeight: 'bold' }}
          >
            {loading ? 'Analyzing...' : 'Create Deployment'}
          </Button>
        </Box>
      </Paper>

      <Dialog open={confirmModalOpen} onClose={() => setConfirmModalOpen(false)}>
        <DialogTitle>Confirm Push Permissions</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            This public repository's manifests need updates for instrumentation. To save these changes to your Git repository,
            please provide a PAT token with push permissions.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="GitHub PAT Token"
            type="password"
            fullWidth
            variant="standard"
            onChange={(e) => setPatToken(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => handleFinalSubmit('')}>Proceed without Pushing</Button>
          <Button onClick={() => handleFinalSubmit(patToken)} variant="contained" disabled={!patToken}>
            Save PAT & Create
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
