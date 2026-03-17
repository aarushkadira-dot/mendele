'use client'

import { ChatInterface } from '@/components/assistant/chat-interface'

export default function AssistantPage() {
  return (
    <div className="h-full flex flex-col min-w-0">
      <ChatInterface />
    </div>
  )
}
