import { encodeFunctionData, erc20Abi, formatUnits, getAddress, keccak256, parseUnits, stringToBytes } from "viem";
import { paymentIntentRegistryAbi } from "../../shared/abi";
import type { AppConfig, PaymentIntent } from "./types";

export function slugHash(slug: string) {
  return keccak256(stringToBytes(slug));
}

export function tokenAddress(config: AppConfig, currency: "USDC" | "EURC") {
  const value = config.tokens[currency];
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${currency} token address is not configured`);
  }
  return getAddress(value);
}

export function registryAddress(config: AppConfig) {
  if (!config.paymentRegistryAddress || !/^0x[a-fA-F0-9]{40}$/.test(config.paymentRegistryAddress)) {
    throw new Error("Payment registry contract address is not configured");
  }
  return getAddress(config.paymentRegistryAddress);
}

export function encodeCreateIntent(config: AppConfig, intent: PaymentIntent) {
  return encodeFunctionData({
    abi: paymentIntentRegistryAbi,
    functionName: "createIntent",
    args: [
      slugHash(intent.slug),
      getAddress(intent.recipient_address),
      tokenAddress(config, intent.currency),
      parseUnits(intent.amount, 6),
      `supabase://${intent.slug}`
    ]
  });
}

export function encodeApprove(config: AppConfig, intent: PaymentIntent) {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [registryAddress(config), parseUnits(intent.amount, 6)]
  });
}

export function encodePayIntent(config: AppConfig, onchainIntentId: bigint) {
  return encodeFunctionData({
    abi: paymentIntentRegistryAbi,
    functionName: "payIntent",
    args: [onchainIntentId]
  });
}

export function displayTokenAmount(value: bigint) {
  return formatUnits(value, 6);
}
