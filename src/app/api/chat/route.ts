import { NextRequest, NextResponse } from "next/server";

// Read at request time (this route only ever runs on the server), so the
// backend host is a runtime setting rather than a baked-in build value.
const API_BASE_URL = (process.env.BACKEND_ORIGIN || "").replace(/\/+$/, "");
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

    // `authorization` carries the pass from the DICE login service. It is
    // passed on untouched and never checked or logged here: the backend is the
    // only place that checks it, and it answers 401 when the pass is missing
    // or bad. `user-agent` and `x-forwarded-for` go along because the backend
    // records the browser with each visit.
    const passedOn = new Headers();

    for (const name of ["authorization", "user-agent", "x-forwarded-for"]) {
      const value = req.headers.get(name);

      if (value) passedOn.set(name, value);
    }

    let pythonBackendResponse: Response;

    if (imageFile instanceof File && imageFile.size > 0) {
      const backendForm = new FormData();

      backendForm.append("image_file", imageFile, imageFile.name);

      pythonBackendResponse = await fetch(backendUrl, {
        method: "POST",
        headers: passedOn,
        body: backendForm,
      });
    } else {
      passedOn.set("Content-Type", "application/json");

      pythonBackendResponse = await fetch(backendUrl, {
        method: "POST",
        headers: passedOn,
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

      // Status and body go back unchanged, with the backend's content type,
      // so the page can read the `code` of a refusal (see auth-client.ts).
      const contentType = pythonBackendResponse.headers.get("content-type");

      return new NextResponse(errorText, {
        status: pythonBackendResponse.status,
        headers: contentType ? { "content-type": contentType } : undefined,
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
