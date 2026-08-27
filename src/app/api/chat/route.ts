import { v4 as uuidv4 } from "uuid";
import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const APP_NAME = process.env.ADK_APP_NAME || "";
const MAX_INPUT_LENGTH = parseInt(
  process.env.NEXT_PUBLIC_MAX_INPUT_LENGTH || "100000",
  10,
);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const userId = formData.get("userId")?.toString();
    const sessionId = formData.get("sessionId")?.toString();
    const message = formData.get("message")?.toString();
    const imageFile = formData.get("file");
    const isNewSession = formData.get("newSession") === "true";

    if (!userId || !sessionId || !message) {
      return new NextResponse("Missing required fields", {
        status: 400,
      });
    }

    if (message.length > MAX_INPUT_LENGTH) {
      return new NextResponse("Input exceeds maximum length", {
        status: 413,
      });
    }

    const params = new URLSearchParams({
      query: message,
    });

    if (isNewSession) {
      params.set("new_session", "true");
    }

    const backendUrl = `${API_BASE_URL}/apps/users/${encodeURIComponent(
      userId,
    )}/sessions/${encodeURIComponent(sessionId)}/run?${params.toString()}`;

    if (process.env.NODE_ENV === "development") {
      console.log(
        ">>> Request TO ADK Backend:",
        JSON.stringify(
          {
            query: message,
            new_session: isNewSession,
            image: imageFile instanceof File ? imageFile.name : null,
            backendUrl,
          },
          null,
          2,
        ),
      );
    }

    let pythonBackendResponse: Response;

    if (imageFile instanceof File && imageFile.size > 0) {
      const backendForm = new FormData();

      backendForm.append("image_file", imageFile, imageFile.name);

      pythonBackendResponse = await fetch(backendUrl, {
        method: "POST",
        body: backendForm,
      });
    } else {
      pythonBackendResponse = await fetch(backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: message,
          ...(isNewSession ? { new_session: true } : {}),
        }),
      });
    }

    if (!pythonBackendResponse.ok) {
      const errorText = await pythonBackendResponse.text();

      console.error(
        `Backend error (${pythonBackendResponse.status}):`,
        errorText,
      );

      return new NextResponse(errorText, {
        status: pythonBackendResponse.status,
      });
    }

    const data = await pythonBackendResponse.json();

    const finalText = data.response;

    return NextResponse.json({
      response: finalText,
      timestamp: data.timestamp,
    });
  } catch (error) {
    console.error("Error in chat API route:", error);

    return new NextResponse("Internal Server Error", {
      status: 500,
    });
  }
}

export async function GET() {
  try {
    const userId = uuidv4();
    const sessionId = uuidv4();

    const response = await fetch(
      `${API_BASE_URL}/apps/${APP_NAME}/users/${userId}/sessions/${sessionId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          state: {},
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        `Error creating backend session (${response.status}):`,
        errorText,
      );

      return new NextResponse(errorText, {
        status: response.status,
      });
    }

    return NextResponse.json({
      userId,
      sessionId,
    });
  } catch (error) {
    console.error("Error creating session:", error);

    return NextResponse.json(
      {
        message: "Internal Server Error",
      },
      {
        status: 500,
      },
    );
  }
}
