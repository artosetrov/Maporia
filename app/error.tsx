"use client";

import { useEffect } from "react";
import ErrorPage from "./components/ErrorPage";

/**
 * Next.js error.tsx - Global error handler for the app router
 * Beautiful error page in Maporia branding style
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("Global error:", error);
    }
  }, [error]);

  // Create a custom error page with reset functionality
  return (
    <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center">
        {/* 404 Illustration */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            {/* Map pin illustration */}
            <svg
              width="200"
              height="200"
              viewBox="0 0 200 200"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-[#8F9E4F]"
            >
              {/* Background circle */}
              <circle
                cx="100"
                cy="100"
                r="90"
                fill="#C9D2A3"
                fillOpacity="0.2"
              />
              
              {/* Map pin */}
              <g transform="translate(100, 100)">
                {/* Pin shadow */}
                <ellipse
                  cx="0"
                  cy="45"
                  rx="25"
                  ry="8"
                  fill="#8F9E4F"
                  fillOpacity="0.2"
                />
                
                {/* Pin body */}
                <path
                  d="M 0 -50 L -20 20 L 0 40 L 20 20 Z"
                  fill="#8F9E4F"
                  stroke="#7A8A3F"
                  strokeWidth="2"
                />
                
                {/* Pin inner circle */}
                <circle
                  cx="0"
                  cy="0"
                  r="15"
                  fill="#FAFAF7"
                  stroke="#8F9E4F"
                  strokeWidth="2"
                />
                
                {/* Error symbol */}
                <text
                  x="0"
                  y="5"
                  textAnchor="middle"
                  fontSize="18"
                  fontWeight="700"
                  fill="#8F9E4F"
                  fontFamily="var(--font-fraunces), Georgia, serif"
                >
                  !
                </text>
              </g>
              
              {/* Decorative elements */}
              <circle
                cx="50"
                cy="50"
                r="8"
                fill="#C9D2A3"
                fillOpacity="0.4"
              />
              <circle
                cx="150"
                cy="50"
                r="6"
                fill="#C9D2A3"
                fillOpacity="0.4"
              />
              <circle
                cx="50"
                cy="150"
                r="6"
                fill="#C9D2A3"
                fillOpacity="0.4"
              />
              <circle
                cx="150"
                cy="150"
                r="8"
                fill="#C9D2A3"
                fillOpacity="0.4"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1 className="font-fraunces text-4xl lg:text-5xl font-semibold text-[#1F2A1F] mb-4">
          Something went wrong
        </h1>

        {/* Message */}
        <p className="text-lg text-[#6F7A5A] mb-8 max-w-md mx-auto">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-[#8F9E4F] text-white rounded-full hover:bg-[#7A8A3F] transition-all duration-200 flex items-center gap-2 font-medium"
          >
            Try again
          </button>
          
          <button
            onClick={() => window.location.href = "/"}
            className="px-6 py-3 bg-white border-2 border-[#ECEEE4] text-[#1F2A1F] rounded-full hover:bg-[#FAFAF7] hover:border-[#8F9E4F] transition-all duration-200 flex items-center gap-2 font-medium"
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}
