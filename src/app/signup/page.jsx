'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  async function handleSignup(e) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const form = e.currentTarget;
    const name = form.name.value.trim();
    const phone = form.phone.value.trim();
    const city = form.city.value.trim();
    const address = form.address.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, phone, city, address }
      }
    });

    setLoading(false);

    if (error) {
      console.error('Signup error:', error);
      setMessage(error.message);
      return;
    }

    if (data?.user) {
      setMessage('Signup successful! Check your inbox if confirmation is required.');
    } else {
      setMessage('Check your email to confirm your account.');
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px' }}>
      <h1 style={{ marginBottom: 16 }}>Create account</h1>
      <form onSubmit={handleSignup} style={{ display: 'grid', gap: 12 }}>
        <input name="name" placeholder="Full name" required />
        <input name="phone" placeholder="Phone number" inputMode="tel" />
        <input name="city" placeholder="City" />
        <input name="address" placeholder="Address" />
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password" minLength={6} required />
        <button type="submit" disabled={loading}>
          {loading ? 'Signing up…' : 'Sign Up'}
        </button>
      </form>
      {message && <p style={{ marginTop: 12 }}>{message}</p>}
    </main>
  );
}
