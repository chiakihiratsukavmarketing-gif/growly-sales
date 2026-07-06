export function logSuppressionBlock(input: {
  operation: string;
  leadId?: string;
  emailAddress?: string;
  reason: string;
}): void {
  const parts = [
    '[mail-suppression]',
    `operation=${input.operation}`,
    input.leadId ? `leadId=${input.leadId}` : null,
    input.emailAddress ? `email=${input.emailAddress}` : null,
    `reason=${input.reason.replace(/\s+/g, ' ')}`,
  ].filter(Boolean);
  console.info(parts.join(' '));
}
