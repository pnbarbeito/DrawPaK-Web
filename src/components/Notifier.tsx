import React from 'react';
import { Snackbar, Alert } from '@mui/material';
import type { AlertColor } from '@mui/material';
import { subscribe } from './notifierBus';

type NotifyOptions = { message: string; severity?: AlertColor; duration?: number };

export const NotifierRenderer: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [severity, setSeverity] = React.useState<AlertColor>('info');
  const [duration, setDuration] = React.useState<number | undefined>(3000);

  React.useEffect(() => {
    const unsub = subscribe((opts: NotifyOptions) => {
      setMessage(opts.message);
      setSeverity(opts.severity || 'info');
      setDuration(opts.duration || 3000);
      setOpen(true);
    });
    return unsub;
  }, []);

  const handleClose = (_?: unknown, reason?: string) => {
    if (reason === 'clickaway') return;
    setOpen(false);
  };

  return (
    <Snackbar open={open} autoHideDuration={duration} onClose={handleClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert onClose={handleClose} severity={severity} sx={{ width: '100%' }} variant="filled">
        {message}
      </Alert>
    </Snackbar>
  );
};

export default NotifierRenderer;
