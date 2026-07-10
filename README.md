<div align="center">
  <img src="public/next.svg" alt="Logo" width="120" height="120" />

  # AIDL Platform 🚀
  
  **Enterprise-grade, Multi-Tenant AI Data Analysis SaaS**
  
  [Features](#features) • [Tech Stack](#tech-stack) • [Installation](#installation) • [Usage](#usage) • [Architecture](#architecture)
</div>

---

## 📖 Overview

**AIDL Platform** is an advanced, multi-tenant Software-as-a-Service (SaaS) built to revolutionize how businesses interact with their data. It empowers organizations to upload raw datasets (Excel, JSON) or documents (PDFs, Invoices), write custom prompts, and instantly receive structured AI-generated insights and reports.

Built with security and scalability in mind, it features strict tenant data isolation, dynamic dark/light themes, and a robust NextAuth authentication system.

---

## ✨ Features

- 🔐 **Secure Multi-Tenancy:** Complete logical isolation of data between tenants using `tenantId` strict scoping in MongoDB.
- 🧠 **AI-Powered Data Pipelines:** Upload `.xlsx` files, write custom prompts, and let AI extract insights seamlessly.
- 🎨 **Modern & Dynamic UI:** Premium, glass-morphism aesthetic with full **Dark / Light Mode** support (Next-Themes).
- 🔔 **Real-time Notifications:** In-app notification bell and pop-up toasts for processing status.
- 🔑 **API Key Management:** Generate, mask, and revoke secure API keys scoped to tenant quotas.
- 🧑‍💻 **Super Admin Dashboard:** Centralized control over AI Model configurations and system monitoring.
- ⚡ **Optimized Performance:** Built on Next.js App Router with Server Components and Server Actions.

---

## 🛠️ Tech Stack

- **Framework:** [Next.js 15](https://nextjs.org/) (App Router, Server Actions)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Authentication:** [NextAuth.js (Auth.js)](https://next-auth.js.org/)
- **Database:** [MongoDB](https://www.mongodb.com/) via [Mongoose](https://mongoosejs.com/)
- **Styling:** Vanilla CSS Variables & TailwindCSS
- **Components & Icons:** [Lucide React](https://lucide.dev/)
- **Data Parsing:** [SheetJS (xlsx)](https://sheetjs.com/)

---

## 🚀 Installation & Setup

### Prerequisites
- Node.js (v18+)
- MongoDB connection string (Atlas or Local)

### 1. Clone the repository
```bash
git clone https://github.com/memoadeldev-prog/multi-tenant-ai-data-analyzer.git
cd multi-tenant-ai-data-analyzer
```

### 2. Install dependencies
```bash
npm install
```

### 3. Environment Variables
Create a `.env.local` file in the root directory and add the following:
```env
# MongoDB Connection
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/aidlplatform

# NextAuth Secrets
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate-a-strong-secret-key
```

### 4. Start the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

---

## 👥 Usage Guide

### Super Admin
- **Login:** `/login` (Default seed account: `admin@aidl.com` / `SuperSecretPassword!`)
- **Action:** Add AI Models (e.g., OpenAI, Gemini) in the `/admin/models` page to allow tenants to use them.

### Tenant User
- **Register/Login:** `/register` or `/login`
- **Dashboard:** Navigate to `/dashboard/upload` to upload an Excel file.
- **Generate Report:** Select an AI Model, write your prompt (e.g., *"Summarize sales by region"*), and hit generate.
- **Data Explorer:** View structured AI results and raw parsed text in `/dashboard/data-explorer`.

---

## 🏗️ Architecture Highlight: Data Isolation

To prevent cross-tenant data leakage, the platform utilizes a strict DAL (Data Access Layer). 
Every Mongoose query across `ApiKey`, `ExtractedData`, and `Notification` models implicitly enforces the `tenantId` parameter:

```typescript
// Example from src/actions/data-explorer.ts
const docs = await ExtractedData.find({
  tenantId: session.userId, // 🔒 The barrier
  status: ExtractionStatus.COMPLETED
});
```

---

<div align="center">
  <p>Built with ❤️ by AIDL Team.</p>
</div>
