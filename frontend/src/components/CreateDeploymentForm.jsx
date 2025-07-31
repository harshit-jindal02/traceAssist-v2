import React, { useState, useRef } from 'react';
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

  const [modalType, setModalType] = useState(null); // 'public-push-required', 'private-push-required', 'no-changes-needed'
  const [analysisResult, setAnalysisResult] = useState(null); // Store analysis result
  const patInputRef = useRef(null);

  const resetForm = () => {
    setRepoUrl('');
    setPatToken('');
    setDeploymentName('');
    setSuccess('');
    setError('');
    setModalType(null);
    setAnalysisResult(null);
  };

  const handleAnalyzeRepo = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await axios.post(`${backendUrl}/deployments/analyze`, { 
        repo_url: repoUrl,
        pat_token: patToken 
      });
      const analysis = response.data;
      setAnalysisResult(analysis); // Store the analysis result

      if (!analysis.is_public) { // Private Repo Logic
        if (!patToken) {
          setError("This is a private repository. A PAT token is required.");
        } else {
          if (analysis.push_required) {
            setModalType('private-push-required');
          } else {
            setModalType('no-changes-needed');
          }
        }
      } else { // Public Repo Logic
        if (analysis.push_required) {
          if (!patToken) {
            setModalType('public-push-required');
          } else {
            handleFinalSubmit({ push_to_git: true });
          }
        } else {
          setModalType('no-changes-needed');
        }
      }

    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to analyze repository.');
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
      await axios.post(
        `${backendUrl}/deployments`,
        { 
          repo_url: repoUrl, 
          deployment_name: deploymentName, 
          pat_token: finalPatToken,
          push_to_git: push_to_git
        }
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
  
  const handleCloseModalAndFocus = () => {
    setModalType(null);
    setTimeout(() => {
        patInputRef.current?.focus();
    }, 100);
  }

  return (
    <>
      <Paper elevation={3} sx={{ p: 3, borderRadius: 2, width: '100%', maxWidth: '600px', mb: 4 }}>
        <Typography variant="h5" gutterBottom align="center" fontWeight="bold">
          Create New Deployment
        </Typography>
        <Box component="form" onSubmit={handleAnalyzeRepo} display="flex" flexDirection="column" gap={2.5}>
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
            label="GitHub PAT (Required for private repos)"
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
            {loading ? 'Analyzing...' : 'Analyze & Create Deployment'}
          </Button>
        </Box>
      </Paper>

      {/* Modal for PUBLIC repos when push is required */}
      <Dialog open={modalType === 'public-push-required'} onClose={() => setModalType(null)}>
        <DialogTitle>Instrumentation Changes Required</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This public repository's manifests need updates. To save these changes to GitHub, please provide a PAT token in the main form.
            <br/><br/>
            Alternatively, you can proceed without pushing the changes to your repository.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => handleFinalSubmit({ push_to_git: false })}>Proceed without Pushing</Button>
          <Button onClick={handleCloseModalAndFocus} variant="contained">
            OK, I'll add a PAT
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal for PRIVATE repos when push is required */}
      <Dialog open={modalType === 'private-push-required'} onClose={() => setModalType(null)}>
        <DialogTitle>Confirm Push to Private Repository</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This private repository's manifests need updates for instrumentation. Do you want to push these changes to your repository?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => handleFinalSubmit({ push_to_git: false })}>No, Proceed without Pushing</Button>
          <Button onClick={() => handleFinalSubmit({ push_to_git: true })} variant="contained">
            Yes, Push Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal for when no changes are needed (works for public and private) */}
      <Dialog open={modalType === 'no-changes-needed'} onClose={() => setModalType(null)}>
        <DialogTitle>Manifests Already Instrumented</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This repository's manifests are already up-to-date. A Git push will not be performed.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              // Check if the repo was public. If so, we can discard the token.
              // If it was private, we must keep the token for cloning.
              const isPublicRepo = analysisResult ? analysisResult.is_public : false;
              handleFinalSubmit({ push_to_git: false, useEmptyToken: isPublicRepo });
            }} 
            variant="contained"
          >
            Proceed
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
