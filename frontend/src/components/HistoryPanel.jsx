import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip
} from '@mui/material';
import axios from 'axios';

export default function HistoryPanel({ backendUrl }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${backendUrl}/history`);
        setHistory(response.data);
      } catch (error) {
        console.error("Failed to fetch deployment history:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [backendUrl]);

  const getStatusChip = (status) => {
    let color = "default";
    if (status === "Instrumented") color = "success";
    if (status === "Failed") color = "error";
    if (status === "Cloned") color = "info";
    return <Chip label={status} color={color} size="small" />;
  };

  return (
    <Box mt={4} width="100%">
      <Typography variant="h5" gutterBottom>Deployment History</Typography>
      <TableContainer component={Paper}>
        <Table sx={{ minWidth: 650 }} aria-label="deployment history table">
          <TableHead>
            <TableRow>
              <TableCell>Deployment Name</TableCell>
              <TableCell>Repository URL</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Date</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4}>Loading history...</TableCell></TableRow>
            ) : history.length === 0 ? (
                <TableRow><TableCell colSpan={4}>No deployments yet.</TableCell></TableRow>
            ) : (
              history.map((row) => (
                <TableRow key={row.id}>
                  <TableCell component="th" scope="row">{row.deployment_name}</TableCell>
                  <TableCell>{row.repo_url}</TableCell>
                  <TableCell>{getStatusChip(row.status)}</TableCell>
                  <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
