export const dynamic = "force-dynamic"

'use client'

import { useRef } from 'react'
import { ChatInterface, type ChatInterfaceRef } from '@/components/assistant/chat-interface'

export default function AssistantPage() {
  const chatRef = useRef<ChatInterfaceRef>(null)

  return (
    <div className="h-full flex flex-col min-w-0">
      <ChatInterface ref={chatRef} />
    </div>
  )
}
