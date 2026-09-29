"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { adminFetch } from "./admin-api";
import { setTriggerCatalogue, type TriggerDefinition } from "./trigger-catalog";

const SUPPORTED_API_VERSION = 1;
const SUPPORTED_ADMIN_API_VERSION = 2;
const SUPPORTED_EMAIL_DOCUMENT_SCHEMA_VERSION = 1;
const SUPPORTED_SIGNUP_FORM_SCHEMA_VERSION = 1;

interface MessagingContract {
  api_version: number;
  signup_form_schema_version: number;
  trigger_catalogue: TriggerDefinition[];
}

interface MessagingAdminContract {
  api_version: number;
  capabilities: {
    campaign_revisions: boolean;
    consent_ledger: boolean;
    dynamic_segments: boolean;
    flow_simulation: boolean;
    immutable_versions: boolean;
    standard_flow_recipes: boolean;
    visual_email_document: boolean;
  };
  email_document_schema_version: number;
  signup_form_schema_version: number;
  trigger_catalogue: TriggerDefinition[];
}

interface Compatibility {
  canEdit: boolean;
  canUseVisualEmail: boolean;
  loading: boolean;
  message: string | null;
}

const CompatibilityContext = createContext<Compatibility>({
  canEdit: false,
  canUseVisualEmail: false,
  loading: true,
  message: null,
});

export function MessagingContractProvider({
  children,
}: {
  children: ReactNode;
}) {
  const contract = useQuery({
    queryFn: () => adminFetch<MessagingContract>("contract"),
    queryKey: ["messaging", "contract"],
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });
  const adminContract = useQuery({
    queryFn: () => adminFetch<MessagingAdminContract>("v2/contract"),
    queryKey: ["messaging", "v2", "contract"],
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const catalogue =
      adminContract.data?.trigger_catalogue ?? contract.data?.trigger_catalogue;
    if (catalogue) setTriggerCatalogue(catalogue);
  }, [adminContract.data, contract.data]);

  let message: string | null = null;
  if (contract.error || adminContract.error) {
    message =
      "Messaging compatibility could not be verified. Editing is disabled.";
  } else if (
    contract.data &&
    (contract.data.api_version !== SUPPORTED_API_VERSION ||
      contract.data.signup_form_schema_version !==
        SUPPORTED_SIGNUP_FORM_SCHEMA_VERSION)
  ) {
    message =
      "This Messaging service uses an unsupported editor contract. Data remains readable, but editing is disabled.";
  } else if (
    adminContract.data &&
    (adminContract.data.api_version !== SUPPORTED_ADMIN_API_VERSION ||
      adminContract.data.email_document_schema_version !==
        SUPPORTED_EMAIL_DOCUMENT_SCHEMA_VERSION ||
      !adminContract.data.capabilities.immutable_versions)
  ) {
    message =
      "This Messaging service does not support the required immutable editor contract. Data remains readable, but editing is disabled.";
  }
  const canUseVisualEmail = Boolean(
    adminContract.data?.capabilities.visual_email_document &&
    adminContract.data.email_document_schema_version ===
      SUPPORTED_EMAIL_DOCUMENT_SCHEMA_VERSION,
  );
  const value = {
    canEdit: Boolean(contract.data && adminContract.data) && !message,
    canUseVisualEmail,
    loading: contract.isLoading || adminContract.isLoading,
    message,
  };

  return (
    <CompatibilityContext.Provider value={value}>
      {value.loading ? (
        <div
          aria-live="polite"
          className="mx-4 mt-4 rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
          role="status"
        >
          Verifying Messaging service and document compatibility…
        </div>
      ) : message ? (
        <div
          className="mx-4 mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
          role="alert"
        >
          {message}
        </div>
      ) : null}
      {children}
    </CompatibilityContext.Provider>
  );
}

export function useMessagingCompatibility() {
  return useContext(CompatibilityContext);
}
