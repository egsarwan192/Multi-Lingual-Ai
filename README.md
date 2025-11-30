# Multi-LLM Platform
A comprehensive AI platform that integrates multiple language learning models (LLMs) from different providers, offering users a unified interface for accessing cutting-edge AI capabilities.

## 🚀 Features

### Core Features
- **Multi-Provider Support**: Access models from OpenAI, Anthropic, Google, and Deepseek
- **Real-time Streaming**: Experience instant AI responses with Server-Sent Events
- **Advanced Chat Management**: Organize conversations with search, history, and categorization
- **Subscription Tiers**: Free, Premium, and Pro plans with appropriate model access
- **Usage Analytics**: Track costs, token usage, and get optimization suggestions
- **Secure Authentication**: Supabase-based auth with proper session management
- **Modern UI**: Responsive design built with Tailwind CSS and React

### Technical Stack
- **Frontend**: Next.js 16.0.1 with React 19 and TypeScript
- **Backend**: Next.js API routes with Prisma ORM
- **Database**: PostgreSQL with Prisma schema
- **Authentication**: Supabase Auth
- **State Management**: Zustand with persistence
- **Payments**: Stripe integration with webhooks
- **UI**: Tailwind CSS with custom components
- **Security**: Rate limiting, CSRF protection, input validation

## 🛠️ Architecture Overview

### Database Schema
- **Users**: Authentication profiles with subscription management
- **Chats**: Conversation management with metadata
- **Messages**: Chat history with usage tracking
- **Subscriptions**: Stripe integration with tier management
- **LLMProviders**: Model configuration and access control

### API Structure
```
/api/
├── auth/           # Authentication endpoints
├── chat/           # Chat management and messaging
├── llm/            # Model access and cost estimation
├── subscription/    # Billing and plan management
└── user/           # User profile and settings
```

### Component Architecture
```
components/
├── auth/            # Login, signup forms
├── chat/            # Chat interface components
├── ui/              # Reusable UI components
└── layout/           # Layout and navigation
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18.0.0 or higher
- PostgreSQL 14.0 or higher
- npm, yarn, pnpm, or bun package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd multi-llm-platform
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.template .env.local
   ```
   Edit `.env.local` with your configuration (see Environment Variables section below).

4. **Set up the database**
   ```bash
   npx prisma generate
   npx prisma db push
   npx prisma db seed  # Optional: seed with sample data
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## ⚙️ Environment Variables

Create a `.env.local` file in the project root with the following variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key

# Stripe Configuration
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key

# LLM Provider API Keys
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
GOOGLE_AI_API_KEY=your_google_ai_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key

# Application Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Multi-LLM Platform

# Security
JWT_SECRET=your_jwt_secret_key
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret
```

### Where to get API Keys:
- **Supabase**: [supabase.com](https://supabase.com) - Create a new project
- **Stripe**: [dashboard.stripe.com](https://dashboard.stripe.com) - Create account and get keys
- **OpenAI**: [platform.openai.com](https://platform.openai.com) - API keys from developer dashboard
- **Anthropic**: [console.anthropic.com](https://console.anthropic.com) - Request API access
- **Google AI**: [ai.google.dev](https://ai.google.dev) - Get API credentials
- **Deepseek**: [platform.deepseek.com](https://platform.deepseek.com) - Create account for API access

## 📊 Available Models

### Free Tier
- **GPT-3.5 Turbo**: Fast, efficient for general tasks
- **Claude-3 Haiku**: Compact, quick responses

### Premium Tier
- **GPT-4**: Advanced reasoning and analysis
- **Claude-3 Sonnet**: Balanced performance and capability
- **Gemini-1.5 Flash**: Fast multimodal understanding

### Pro Tier
- **GPT-4 Turbo**: Latest model with improved speed
- **Claude-3 Opus**: Highest capability model
- **Gemini-1.5 Pro**: Advanced multimodal with large context
- **Deepseek Chat & Coder**: Specialized models

## 💰 Subscription Plans

### Free Plan ($0/month)
- 100 messages per day
- 10,000 tokens per message
- Basic models only
- Community support

### Premium Plan ($20/month)
- 1,000 messages per day
- 32,000 tokens per message
- Advanced models access
- Priority support
- Chat history search
- $100 monthly spending limit

### Pro Plan ($50/month)
- Unlimited messages
- 128,000 tokens per message
- All models including latest
- Priority queue access
- Advanced analytics
- API access
- $500 monthly spending limit

## 🔧 Development Scripts

```bash
# Development
npm run dev              # Start development server
npm run build            # Build for production
npm start               # Start production server

# Database
npm run db:generate       # Generate Prisma client
npm run db:push          # Push schema to database
npm run db:studio         # Open Prisma Studio
npm run db:seed          # Seed database with sample data

# Code Quality
npm run lint              # Run ESLint
npm run type-check        # Run TypeScript compiler check

# Testing
npm test                 # Run all tests
npm run test:unit       # Run unit tests only
npm run test:integration  # Run integration tests only
npm run test:e2e         # Run E2E tests with Playwright
```

## 🏗️ Project Structure

```
multi-llm-platform/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.ts              # Database seed data
├── public/                   # Static assets
├── src/
│   ├── app/                 # Next.js app router pages
│   ├── components/           # React components
│   │   ├── auth/          # Authentication forms
│   │   ├── chat/          # Chat interface components
│   │   ├── ui/            # Reusable UI elements
│   │   └── layout/        # Layout components
│   ├── lib/                # Utility libraries
│   │   ├── llm/           # LLM provider integrations
│   │   ├── supabase/      # Database and auth utilities
│   │   ├── stripe/         # Payment processing
│   │   └── utils/          # General utilities
│   └── stores/             # Zustand state stores
├── tests/                    # Test files
├── .env.local               # Environment variables (gitignored)
├── .env.template           # Environment variable template
├── requirements.txt         # Development requirements
└── README.md              # This file
```

## 🔒 Security Features

### Implemented Security Measures
- **Rate Limiting**: Tiered limits for different endpoint types
- **CSRF Protection**: Token-based CSRF prevention
- **Input Validation**: Comprehensive sanitization and validation
- **Security Headers**: CSP, HSTS, X-Frame-Options, etc.
- **Authentication**: Secure session management with Supabase
- **API Key Protection**: Environment variable storage only

### Rate Limits
- **Authentication**: 5 requests per 15 minutes
- **Chat Messages**: 30 messages per minute
- **Chat Creation**: 10 new chats per minute
- **General API**: 100 requests per 15 minutes
- **Settings**: 20 updates per 10 minutes
- **Subscription**: 3 operations per 5 minutes

## 🚀 Deployment

### Production Deployment

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Set production environment variables**
   ```bash
   # Set all required environment variables
   export NODE_ENV=production
   export NEXT_PUBLIC_APP_URL=https://yourdomain.com
   # ... other variables
   ```

3. **Database setup**
   ```bash
   npx prisma generate
   npx prisma db push --prod
   ```

4. **Start the application**
   ```bash
   npm start
   ```

### Vercel Deployment (Recommended)

The easiest way to deploy is using [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme):

1. Connect your GitHub repository
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Docker Deployment

```dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
npm run test:e2e         # End-to-end tests

# Watch mode for development
npm test --watch
```

### Test Structure
```
tests/
├── unit/              # Unit tests for individual functions
├── integration/        # API route integration tests
└── e2e/              # End-to-end user journey tests
```

## 📈 Monitoring & Analytics

### Application Monitoring
- **Error Tracking**: Comprehensive error boundaries
- **Performance Monitoring**: Response times and bottlenecks
- **Usage Analytics**: Model usage and cost tracking
- **Health Checks**: API health monitoring

### Business Metrics
- **User Engagement**: Chat frequency and session duration
- **Revenue Tracking**: Subscription conversions and MRR
- **Model Performance**: Response quality and speed analysis
- **Cost Optimization**: Usage patterns and recommendations

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Code Style
- Use TypeScript for all new code
- Follow existing naming conventions
- Add comments for complex logic
- Include error handling
- Write tests for new features

## 📝 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Getting Help
- **Documentation**: Check this README and inline code comments
- **Issues**: Open an issue on GitHub for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions and community support

### Common Issues
- **Environment Variables**: Ensure all required variables are set
- **Database Connection**: Verify PostgreSQL is running and accessible
- **API Keys**: Confirm all LLM provider keys are valid and active
- **CORS Issues**: Check NEXT_PUBLIC_APP_URL is correctly set

## 🔗 Useful Links

- **Next.js Documentation**: [nextjs.org/docs](https://nextjs.org/docs)
- **Prisma Documentation**: [www.prisma.io/docs](https://www.prisma.io/docs)
- **Supabase Documentation**: [supabase.com/docs](https://supabase.com/docs)
- **Stripe Documentation**: [stripe.com/docs](https://stripe.com/docs)
- **Tailwind CSS**: [tailwindcss.com/docs](https://tailwindcss.com/docs)

---

**Built with ❤️ using Next.js, TypeScript, and modern web technologies.**