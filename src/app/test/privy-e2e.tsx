import type { ReactNode } from "react";

type PrivyUser = {
  wallet?: {
    address: string;
  };
};

const testUser: PrivyUser = {
  wallet: {
    address: "0x1111111111111111111111111111111111111111"
  }
};

export function PrivyProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function usePrivy() {
  return {
    ready: true,
    authenticated: true,
    user: testUser,
    login: () => undefined,
    logout: () => undefined,
    getAccessToken: async () => "e2e-token"
  };
}

export function useSendTransaction() {
  return {
    sendTransaction: async () => ({
      hash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    })
  };
}
