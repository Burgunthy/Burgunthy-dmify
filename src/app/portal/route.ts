import { CustomerPortal } from "@polar-sh/nextjs";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const GET = CustomerPortal({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  server: (process.env.POLAR_SERVER || "sandbox") as "sandbox" | "production",
  returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
  getCustomerId: async (_req: NextRequest) => {
    // Use the regular (cookie-based) client to identify the authenticated user.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Unauthorized: no authenticated user");
    }

    const { data } = await supabase
      .from("users")
      .select("polar_customer_id")
      .eq("id", user.id)
      .single();

    if (!data?.polar_customer_id) {
      throw new Error("No Polar customer found for this user");
    }

    return data.polar_customer_id;
  },
});
