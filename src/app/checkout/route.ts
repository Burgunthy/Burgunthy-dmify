import { Checkout } from "@polar-sh/nextjs";

export const GET = Checkout({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?upgraded=true`,
  returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/pricing`,
  server: (process.env.POLAR_SERVER || "sandbox") as "sandbox" | "production",
});
