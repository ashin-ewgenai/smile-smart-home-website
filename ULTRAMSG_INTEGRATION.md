# UltraMsg WhatsApp Integration Documentation

## explicit example entries and usage notes for PUBLIC_ULTRAMSG_INSTANCE_ID and PUBLIC_ULTRAMSG_TOKEN

This document provides the environment variable configuration and usage instructions for the client-side UltraMsg WhatsApp notification system.

### explicit example entries

```bash
# UltraMsg API Credentials
PUBLIC_ULTRAMSG_INSTANCE_ID=instance12345
PUBLIC_ULTRAMSG_TOKEN=1234567890abcdef
```

### usage notes for PUBLIC_ULTRAMSG_INSTANCE_ID and PUBLIC_ULTRAMSG_TOKEN

1. **Client-Side Access**: The variables `PUBLIC_ULTRAMSG_INSTANCE_ID` and `PUBLIC_ULTRAMSG_TOKEN` must be prefixed with `PUBLIC_` to be accessible within the Astro/Vite client-side code.
2. **Hook Utilization**: These environment variables are used in `src/hooks/useQuoteRequest.ts` to authenticate and route WhatsApp notifications directly from the browser.
3. **Phone Number Formatting**: Recipient phone numbers must be formatted with the country code (e.g., 91 for India) but MUST NOT include the '+' symbol or spaces (e.g., 919876543210).
4. **Environment Setup**: Ensure these variables are defined in your `.env` file for local development and in your production environment settings for deployment.
