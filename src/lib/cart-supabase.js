"use client";

import { getBrowserSupabaseClient as getSupabaseClient } from "@/lib/supabase/browser-client";

export async function addToCart(productId, quantity = 1) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase not configured");

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!user) throw new Error("Not logged in");

  const { error } = await supabase.from("cart_items").insert({
    user_id: user.id,
    product_id: productId,
    quantity,
  });
  if (error) throw error;
}

export async function getCart() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!user) return [];

  // Select cart rows and join product details (assumes FK cart_items.product_id -> products.id)
  const { data, error } = await supabase
    .from("cart_items")
    .select("id, quantity, product:products(id, name, price, image_url)")
    .eq("user_id", user.id);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function updateCartItem(cartItemId, quantity) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("cart_items").update({ quantity }).eq("id", cartItemId);
  if (error) throw error;
}

export async function removeCartItem(cartItemId) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("cart_items").delete().eq("id", cartItemId);
  if (error) throw error;
}
