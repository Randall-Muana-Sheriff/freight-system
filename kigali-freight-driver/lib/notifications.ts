export type DriverNotification = {
  id: string;
  title: string;
  body: string;
  tone: 'info' | 'warning' | 'success';
  timestamp: string;
};
