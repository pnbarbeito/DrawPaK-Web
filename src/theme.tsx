import { createTheme } from '@mui/material/styles';

// Tema MUI forzado en modo claro para la app
const theme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: '#f5f7fb',
      paper: '#ffffff'
    }
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: '#263238'
        }
      }
    }
  }
});

export default theme;
