# Architecture

- **PostgreSQL**: Primary datastore using Prisma ORM.
- **Redis**: BullMQ backing store and conversational state store.
- **Node.js/Express**: REST API and Webhook handler.
- **AI**: Integrates with OpenAI and Anthropic.
- **BullMQ**: Queue architecture for retries and backoff when publishing content.
