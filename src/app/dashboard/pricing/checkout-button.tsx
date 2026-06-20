"use client";

interface CheckoutButtonProps {
  /** Polar product id (NEXT_PUBLIC_POLAR_*_PRODUCT_ID). May be unset in dev. */
  productId: string | undefined;
  userId: string;
  email: string;
  label?: string;
}

/**
 * Redirects the browser to the Polar checkout route handler at /checkout,
 * passing the product, customer email and Supabase user id as query params.
 * (The @polar-sh Checkout handler reads `products`, `customerEmail` and
 * `customerExternalId` from the URL.)
 */
export function CheckoutButton({
  productId,
  userId,
  email,
  label = "결제하기",
}: CheckoutButtonProps) {
  const handleClick = () => {
    if (!productId) {
      alert("결제 설정이 완료되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    const params = new URLSearchParams({
      products: productId,
      customerEmail: email,
      customerExternalId: userId,
    });
    window.location.href = `/checkout?${params.toString()}`;
  };

  return (
    <button
      onClick={handleClick}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
    >
      {label}
    </button>
  );
}
