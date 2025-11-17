import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getSession } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Validation schema for updating chat
const updateChatSchema = z.object({
  title: z.string().min(1, 'Title is required').optional()
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get current session
    const session = await getSession()

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'no_session' },
        { status: 401 }
      )
    }

    const chatId = params.id

    // Get chat with all messages, validating user ownership
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        userId: session.user.id // Ensure user owns this chat
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' } // Order messages chronologically
        }
      }
    })

    if (!chat) {
      return NextResponse.json(
        { error: 'Chat not found', code: 'chat_not_found' },
        { status: 404 }
      )
    }

    // Transform for response
    return NextResponse.json({
      success: true,
      chat: {
        id: chat.id,
        title: chat.title,
        modelProvider: chat.modelProvider,
        modelName: chat.modelName,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messages: chat.messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          tokenUsage: msg.tokenUsage,
          createdAt: msg.createdAt
        }))
      }
    })
  } catch (error) {
    console.error('Get chat error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get current session
    const session = await getSession()

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'no_session' },
        { status: 401 }
      )
    }

    const chatId = params.id

    // Validate request body
    const body = await request.json()
    const validatedData = updateChatSchema.parse(body)

    // Check if chat exists and user owns it
    const existingChat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        userId: session.user.id
      }
    })

    if (!existingChat) {
      return NextResponse.json(
        { error: 'Chat not found', code: 'chat_not_found' },
        { status: 404 }
      )
    }

    // Update chat
    const updatedChat = await prisma.chat.update({
      where: { id: chatId },
      data: {
        updatedAt: new Date()
      },
      ...(validatedData.title && { title: validatedData.title })
    })

    return NextResponse.json({
      success: true,
      chat: {
        id: updatedChat.id,
        title: updatedChat.title,
        modelProvider: updatedChat.modelProvider,
        modelName: updatedChat.modelName,
        createdAt: updatedChat.createdAt,
        updatedAt: updatedChat.updatedAt
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      )
    }

    console.error('Update chat error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get current session
    const session = await getSession()

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'no_session' },
        { status: 401 }
      )
    }

    const chatId = params.id

    // Check if chat exists and user owns it
    const existingChat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        userId: session.user.id
      }
    })

    if (!existingChat) {
      return NextResponse.json(
        { error: 'Chat not found', code: 'chat_not_found' },
        { status: 404 }
      )
    }

    // Delete chat (messages will be deleted due to cascade)
    await prisma.chat.delete({
      where: { id: chatId }
    })

    return NextResponse.json({
      success: true,
      message: 'Chat deleted successfully'
    })
  } catch (error) {
    console.error('Delete chat error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}