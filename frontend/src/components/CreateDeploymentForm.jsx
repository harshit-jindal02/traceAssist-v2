import React, { useState, useRef, useEffect } from 'react';
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
  const [modalType, setModalType] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  
  // --- FIX: Add state to track if the analysis step is complete ---
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const patInputRef = useRef(null);

  // --- FIX: Reset analysis if the repo URL changes ---
  useEffect(() => {
    setAnalysisComplete(false);
  }, [repoUrl]);

  const resetForm = () => {
    setRepoUrl('');
    setPatToken('');
    setDeploymentName('');
    setSuccess('');
    setError('');
    setModalType(null);
    setAnalysisResult(null);
    setAnalysisComplete(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    // --- FIX: If analysis is done, proceed to final submission ---
    if (analysisComplete) {
      // Logic for private repos or public repos that need a push
      if ((!analysisResult.is_public && patToken) || (analysisResult.is_public && analysisResult.push_required && patToken)) {
        handleFinalSubmit({ push_to_git: true });
      } else {
        // Fallback for cases where no token is needed after analysis
        handleFinalSubmit({ push_to_git: false, useEmptyToken: analysisResult.is_public });
      }
    } else {
      // --- Otherwise, run the analysis ---
      handleAnalyzeRepo();
    }
  };

  const handleAnalyzeRepo = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await axios.post(`${backendUrl}/deployments/analyze`, {
        repo_url: repoUrl,
        pat_token: patToken
      });
      const analysis = response.data;
      setAnalysisResult(analysis);
      setAnalysisComplete(true); // --- FIX: Mark analysis as complete

      if (!analysis.is_public) {
        if (!patToken) {
          setError("This is a private repository. A PAT token is required.");
          setAnalysisComplete(false); // Analysis is not successfully complete
        } else if (analysis.push_required) {
          setModalType('private-push-required');
        } else {
          setModalType('no-changes-needed');
        }
      } else {
        if (analysis.push_required) {
          setModalType('public-push-required');
        } else {
          setModalType('no-changes-needed');
        }
      }

    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to analyze repository.');
      setAnalysisComplete(false); // Reset on error
    } finally {
      setLoading(false);
    }
  };

  const handleFinalSubmit = async ({ push_to_git = true, useEmptyToken = false } = {}) => {
    setLoading(true);
    setError('');
    setModalType(null);

    const finalPatToken = useEmptyToken ? '' : patToken;

    try {
      await axios.post(`${backendUrl}/deployments`, {
        repo_url: repoUrl,
        deployment_name: deploymentName,
        pat_token: finalPatToken,
        push_to_git: push_to_git
      });
      setSuccess(`Deployment '${deploymentName}' created successfully!`);
      resetForm();
      onDeploymentCreated();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create deployment.');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModalAndFocus = () => {
    setModalType(null);
    setTimeout(() => {
        patInputRef.current?.focus();
    }, 100);
  }

  const buttonText = analysisComplete ? 'Create Deployment' : 'Analyze & Create';

  return (
    <>
      <Paper elevation={3} sx={{ p: 3, borderRadius: 2, width: '100%', maxWidth: '600px', mb: 4 }}>
        <Typography variant="h5" gutterBottom align="center" fontWeight="bold">
          Create New Deployment
        </Typography>
        <Box component="form" onSubmit={handleFormSubmit} display="flex" flexDirection="column" gap={2.5}>
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
            inputRef={patInputRef}
            type={showPatToken ? 'text' : 'password'}
            label="GitHub PAT (for private repos or push access)"
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
            {loading ? 'Processing...' : buttonText}
          </Button>
        </Box>
      </Paper>

      {/* MODALS */}
      <Dialog open={modalType === 'public-push-required'} onClose={() => setModalType(null)}>
        <DialogTitle>Instrumentation Changes Required</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This public repository needs updates. To save these changes to GitHub, provide a PAT token and click "Create Deployment" again.
            <br/><br/>
            Or, proceed without pushing the changes to your repo.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => handleFinalSubmit({ push_to_git: false, useEmptyToken: true })}>Proceed without Pushing</Button>
          <Button onClick={handleCloseModalAndFocus} variant="contained">
            OK, I'll add a PAT
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={modalType === 'private-push-required'} onClose={() => setModalType(null)}>
        <DialogTitle>Confirm Push to Private Repository</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This private repository needs updates. Do you want to push these changes?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => handleFinalSubmit({ push_to_git: false })}>No, Don't Push</Button>
          <Button onClick={() => handleFinalSubmit({ push_to_git: true })} variant="contained">
            Yes, Push Changes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={modalType === 'no-changes-needed'} onClose={() => setModalType(null)}>
        <DialogTitle>Manifests Already Instrumented</DialogTitle>
        <DialogContent>
          <DialogContentText>
            No changes are needed. A Git push is not required.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => handleFinalSubmit({ push_to_git: false, useEmptyToken: analysisResult.is_public })}
            variant="contained"
          >
            Proceed to Deploy
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}