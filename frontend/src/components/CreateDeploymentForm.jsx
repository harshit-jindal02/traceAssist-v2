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

  const [modalType, setModalType] = useState(null); // 'push-required' or 'no-changes-needed'
  const patInputRef = useRef(null);

  const resetForm = () => {
    setRepoUrl('');
    setPatToken('');
    setDeploymentName('');
    setSuccess('');
    setError('');
    setModalType(null);
  };

  const handleInitialSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await axios.post(`${backendUrl}/deployments/analyze`, { repo_url: repoUrl });
      const analysis = response.data;

      if (!analysis.is_public) {
        if (!patToken) {
          setError("This is a private repository. A PAT token is required.");
        } else {
          handleFinalSubmit(); // Private repo with token, proceed directly
        }
      } else { // Public repository
        if (analysis.push_required) {
          if (!patToken) {
            setModalType('push-required'); // Needs changes, no token provided yet
          } else {
            handleFinalSubmit(); // Needs changes, token is provided, proceed
          }
        } else {
          setModalType('no-changes-needed'); // No changes needed
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to analyze repository.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalSubmit = async (useEmptyToken = false) => {
    setLoading(true);
    setError('');
    setModalType(null);

    const finalPatToken = useEmptyToken ? '' : patToken;

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
  
  const handleCloseModalAndFocus = () => {
    setModalType(null);
    // Use a timeout to ensure the DOM is updated before focusing
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
            inputRef={patInputRef}
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

      {/* Modal for when push is required */}
      <Dialog open={modalType === 'push-required'} onClose={() => setModalType(null)}>
        <DialogTitle>Instrumentation Changes Required</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This public repository's manifests need updates. To save these changes to GitHub, please provide a PAT token in the main form.
            <br/><br/>
            Alternatively, you can proceed without pushing the changes to your repository.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => handleFinalSubmit(true)}>Proceed without Pushing</Button>
          <Button onClick={handleCloseModalAndFocus} variant="contained">
            OK, I'll add a PAT
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal for when no changes are needed */}
      <Dialog open={modalType === 'no-changes-needed'} onClose={() => setModalType(null)}>
        <DialogTitle>Manifests Already Instrumented</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This public repository's manifests are already up-to-date. No PAT token is required.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => handleFinalSubmit()} variant="contained">
            Proceed
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
