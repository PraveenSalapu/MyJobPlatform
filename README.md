# 🎯 MyJobPlatform - AI-Powered Job Application Management System

[![React](https://img.shields.io/badge/React-18.3.1-61DAFB?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.0.5-646CFF?logo=vite)](https://vite.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.2-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> An intelligent job application tracking system with AI-powered PDF resume rendering, webhook automation, and comprehensive application management.

## 📋 Overview

MyJobPlatform is a full-stack web application designed to streamline the job search process for software engineers and professionals. It provides automated application tracking, intelligent PDF resume generation with consistent rendering, and real-time webhook integrations for seamless workflow automation.

### Key Features

🤖 **AI-Powered Resume Generation**
- Dynamic PDF rendering with consistent cross-platform output
- Template-based resume customization
- Real-time preview and editing

📊 **Application Tracking Dashboard**
- Visual pipeline management (Applied → Interview → Offer)
- Status tracking and analytics
- Company and position metadata management

🔗 **Webhook Automation**
- Real-time application status updates
- Integration with external job boards
- Automated notification system

🎨 **Modern UI/UX**
- Responsive design with React 18
- Fast development with Vite HMR
- TypeScript for type safety

## 🚀 Live Demo

**Coming Soon** - Deployment in progress

## 🛠️ Tech Stack

### Frontend
- **React 18.3.1** - UI component library
- **TypeScript 5.6.2** - Type-safe JavaScript
- **Vite 6.0.5** - Next-generation frontend tooling
- **ESLint** - Code quality and consistency

### Backend (Planned)
- Node.js / Express
- PostgreSQL / MongoDB
- JWT Authentication

### PDF Generation
- Custom rendering engine
- Cross-platform consistency fixes
- Template-based generation

## 📦 Installation

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/PraveenSalapu/MyJobPlatform.git
cd MyJobPlatform

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🎯 Usage

### Development Server
```bash
npm run dev
# Opens at http://localhost:5173
```

### Linting
```bash
npm run lint
```

### Production Build
```bash
npm run build
npm run preview
```

## 📁 Project Structure

```
MyJobPlatform/
├── src/
│   ├── components/     # React components
│   ├── pages/          # Page components
│   ├── hooks/          # Custom React hooks
│   ├── utils/          # Utility functions
│   ├── types/          # TypeScript type definitions
│   └── App.tsx         # Main application component
├── public/             # Static assets
├── vite.config.ts      # Vite configuration
├── tsconfig.json       # TypeScript configuration
├── eslint.config.js    # ESLint configuration
└── package.json        # Dependencies and scripts
```

## 🔧 Configuration

### Environment Variables
Create a `.env` file in the root directory:

```env
VITE_API_URL=your_api_url
VITE_WEBHOOK_SECRET=your_webhook_secret
```

### ESLint Setup
The project uses type-aware lint rules. For production:

```js
export default tseslint.config({
  extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
  rules: {
    '@typescript-eslint/no-unused-vars': 'error'
  }
})
```

## 🤝 Contributing

Contributions welcome! Please follow these steps:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 👤 Author

**Praveen Salapu**
- GitHub: [@PraveenSalapu](https://github.com/PraveenSalapu)
- LinkedIn: [Connect with me](https://linkedin.com/in/yourprofile)

## 🙏 Acknowledgments

- OpenAI for GPT-4 API
- Supabase for backend infrastructure
- React and Vite communities

---

**Built with ❤️ for job seekers navigating the competitive tech market**
