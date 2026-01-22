"use client";

import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";

export default function CollectionsPage() {
  return (
    <>
      <TopBar />
      <main className="min-h-screen bg-[#FAFAF7] pt-safe-top pb-safe-bottom">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 pb-12">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl font-semibold font-fraunces text-[#1F2A1F] mb-4">
              Collections
            </h1>
            <p className="text-lg text-[#6F7A5A] mb-8">
              This page is under development
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FAFAF7] border border-[#ECEEE4]">
              <svg className="w-5 h-5 text-[#8F9E4F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-[#6F7A5A]">
                Coming soon
              </span>
            </div>
          </div>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
