'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchCurrentUser, logout, type AuthUser } from '@lingprism/graphql';
import { AdminShell } from '../components/AdminShell';
import { ArchitecturePanel } from '../components/panels/ArchitecturePanel';
import { AlertsPanel } from '../components/panels/AlertsPanel';
import { KnowledgePanel } from '../components/panels/KnowledgePanel';
import { ReposPanel } from '../components/panels/ReposPanel';
import { TemplatesPanel } from '../components/panels/TemplatesPanel';
import { WorkbenchPanel } from '../components/panels/WorkbenchPanel';
import { parseModuleParam, type AdminModule } from '../lib/modules';

function AdminHomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<AuthUser | null>(null);
  const activeModule = parseModuleParam(searchParams.get('module'));

  useEffect(() => {
    fetchCurrentUser()
      .then((current) => {
        if (!current) {
          router.replace('/login');
          return;
        }
        setUser(current);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  const setModule = (module: AdminModule | null) => {
    if (module) {
      router.replace(`/?module=${module}`, { scroll: false });
    } else {
      router.replace('/', { scroll: false });
    }
  };

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const renderPanel = () => {
    switch (activeModule) {
      case 'repos':
        return <ReposPanel />;
      case 'knowledge':
        return <KnowledgePanel />;
      case 'architecture':
        return <ArchitecturePanel />;
      case 'templates':
        return <TemplatesPanel />;
      case 'alerts':
        return <AlertsPanel />;
      default:
        return <WorkbenchPanel />;
    }
  };

  return (
    <AdminShell
      user={user}
      activeModule={activeModule}
      onModuleSelect={(key) => setModule(key)}
      onBack={() => setModule(null)}
      onLogout={handleLogout}
    >
      {renderPanel()}
    </AdminShell>
  );
}

export default function AdminHomePage() {
  return (
    <Suspense fallback={null}>
      <AdminHomeContent />
    </Suspense>
  );
}
