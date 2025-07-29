import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

export default function GrafanaPanel() {
  // This URL points to the port-forwarded Grafana service.
  const grafanaUrl = 'http://localhost:3000';

  return (
    <Box mt={4} width="100%">
      <Typography variant="h5" gutterBottom align="center">
        Observability Dashboard
      </Typography>
      <Paper 
        elevation={3} 
        sx={{ 
          height: '800px', 
          width: '100%', 
          overflow: 'hidden', 
          borderRadius: 2 
        }}
      >
        <iframe
          src={grafanaUrl}
          style={{ width: '100%', height: '100%', border: 0 }}
          title="Grafana Dashboard"
        />
      </Paper>
      <Typography variant="caption" display="block" align="center" mt={1}>
        Default login for Grafana is <strong>admin</strong> / <strong>prom-operator</strong>. You may need to refresh after the services have fully started.
      </Typography>
    </Box>
  );
}
