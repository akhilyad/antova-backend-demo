"use client";

import * as React from "react";
import { ShieldCheck, Chrome } from "lucide-react";

const AVATARS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80",
];

const SignIn1 = () => {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");

  const validateEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  const handleSignIn = () => {
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    if (!validateEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    alert("Sign in successful! (Demo)");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#090A0C] relative overflow-hidden w-full">
      {/* Centered glass card */}
      <div className="relative z-10 w-full max-w-sm rounded-3xl bg-gradient-to-b from-white/[0.06] to-[#111318] border border-[#1E222B] backdrop-blur-sm shadow-2xl p-8 flex flex-col items-center">
        {/* Logo */}
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#FF5500]/15 border border-[#FF5500]/30 mb-6 shadow-lg">
          <ShieldCheck className="w-6 h-6 text-[#FF5500]"/>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-semibold text-white mb-1 text-center">
          Antova
        </h2>
        <p className="text-xs text-gray-400 mb-6 text-center">
          Technical & commercial bid evaluation
        </p>

        {/* Form */}
        <div className="flex flex-col w-full gap-4">
          <div className="w-full flex flex-col gap-3">
            <input
              placeholder="Work email"
              type="email"
              value={email}
              className="w-full px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5500]"
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              placeholder="Password"
              type="password"
              value={password}
              className="w-full px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5500]"
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <div className="text-sm text-red-400 text-left">{error}</div>
            )}
          </div>
          <hr className="border-white/10" />
          <div>
            <button
              type="button"
              onClick={handleSignIn}
              className="w-full bg-[#FF5500] text-white font-medium px-5 py-3 rounded-full shadow hover:bg-[#EA580C] transition mb-3 text-sm"
            >
              Sign in
            </button>
            {/* SSO / Google Sign In */}
            <button
              type="button"
              onClick={() => alert("SSO sign-in (Demo)")}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-b from-[#161920] to-[#111318] border border-white/10 rounded-full px-5 py-3 font-medium text-white shadow hover:brightness-110 transition mb-2 text-sm"
            >
              <Chrome className="w-4 h-4 text-gray-300"/>
              Continue with Google
            </button>
            <div className="w-full text-center mt-2">
              <span className="text-xs text-gray-400">
                Need reviewer access?{" "}
                <a
                  href="/governance"
                  className="underline text-white/80 hover:text-white"
                >
                  Enter reviewer token
                </a>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* User count and avatars */}
      <div className="relative z-10 mt-10 flex flex-col items-center text-center">
        <p className="text-gray-400 text-sm mb-3">
          Used by <span className="font-medium text-white">EPC procurement</span>{" "}
          and electrical engineering teams.
        </p>
        <div className="flex -space-x-2">
          {AVATARS.map((src, idx) => (
            <img
              key={idx}
              src={src}
              alt={`Procurement reviewer ${idx + 1}`}
              className="w-8 h-8 rounded-full border-2 border-[#090A0C] object-cover"
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export { SignIn1 };
export default SignIn1;
