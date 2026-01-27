"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "./Icon";

interface ErrorPageProps {
  error?: Error | null;
  statusCode?: number;
  title?: string;
  message?: string;
}

/**
 * Beautiful error page component in Maporia branding style
 * Supports both error boundaries and 404 pages
 */
export default function ErrorPage({ 
  error, 
  statusCode = 500,
  title,
  message 
}: ErrorPageProps) {
  const router = useRouter();
  const is404 = statusCode === 404;
  const displayTitle = title || (is404 ? "Page not found" : "Something went wrong");
  const displayMessage = message || error?.message || (is404 
    ? "The page you're looking for doesn't exist or has been moved."
    : "An unexpected error occurred. Please try again.");

  return (
    <main className="min-h-screen bg-[#FAFAF7] flex items-center justify-center p-4">
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
                
                {/* 404 text in pin */}
                <text
                  x="0"
                  y="5"
                  textAnchor="middle"
                  fontSize="18"
                  fontWeight="700"
                  fill="#8F9E4F"
                  fontFamily="var(--font-fraunces), Georgia, serif"
                >
                  {statusCode}
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
          {displayTitle}
        </h1>

        {/* Message */}
        <p className="text-lg text-[#6F7A5A] mb-8 max-w-md mx-auto">
          {displayMessage}
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button
            onClick={() => router.back()}
            className="px-6 py-3 bg-white border-2 border-[#ECEEE4] text-[#1F2A1F] rounded-full hover:bg-[#FAFAF7] hover:border-[#8F9E4F] transition-all duration-200 flex items-center gap-2 font-medium"
          >
            <Icon name="back" size={20} className="text-[#8F9E4F]" />
            Go back
          </button>
          
          <Link
            href="/"
            className="px-6 py-3 bg-[#8F9E4F] text-white rounded-full hover:bg-[#7A8A3F] transition-all duration-200 flex items-center gap-2 font-medium"
          >
            <Icon name="map" size={20} className="text-white" />
            Go home
          </Link>
          
          {!is404 && (
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-white border-2 border-[#ECEEE4] text-[#1F2A1F] rounded-full hover:bg-[#FAFAF7] hover:border-[#8F9E4F] transition-all duration-200 flex items-center gap-2 font-medium"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[#8F9E4F]"
              >
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              Reload page
            </button>
          )}
        </div>

        {/* Help text */}
        <p className="mt-8 text-sm text-[#A8B096]">
          If this problem persists, please{" "}
          <a
            href="mailto:support@maporia.com"
            className="text-[#8F9E4F] hover:underline"
          >
            contact support
          </a>
        </p>
      </div>
    </main>
  );
}
