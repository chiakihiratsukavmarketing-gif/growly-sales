export class MailOpsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailOpsConfigurationError';
  }
}
