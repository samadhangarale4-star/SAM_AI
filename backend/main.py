import os
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from groq import Groq
from dotenv import load_dotenv


# ============================================================
# LOAD API KEY
# ============================================================

load_dotenv(Path(__file__).parent / ".env")

my_api_key = os.getenv("GROQ_API_KEY")

if not my_api_key:
    raise ValueError(
        "GROQ_API_KEY environment variable is not set."
    )


client = Groq(api_key=my_api_key)

model = "openai/gpt-oss-120b"


# ============================================================
# LOAD PROFILE
# ============================================================

PROFILE_PATH = Path(__file__).parent / "profile.md"

with open(
    PROFILE_PATH,
    "r",
    encoding="utf-8"
) as file:

    profile = file.read()


system_prompt = profile


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI()


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,

    allow_origins=["*"],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
)


# ============================================================
# REQUEST MODELS
# ============================================================

class ChatMessage(BaseModel):

    role: str

    content: str


class ChatRequest(BaseModel):

    message: str

    history: list[ChatMessage] = Field(
        default_factory=list
    )


# ============================================================
# HOME
# ============================================================

@app.get("/")
def home():

    return {
        "message":
        "Samadhan AI Portfolio Backend is working!"
    }


# ============================================================
# STREAM AI RESPONSE
# ============================================================

@app.post("/chat")
def chat(request: ChatRequest):

    question = request.message


    # --------------------------------------------------------
    # BUILD CONVERSATION
    # --------------------------------------------------------

    messages = [

        {
            "role": "system",
            "content": system_prompt
        }

    ]


    # Add previous conversation

    for message in request.history:

        messages.append({

            "role": message.role,

            "content": message.content

        })


    # Add current question

    messages.append({

        "role": "user",

        "content": question

    })


    # --------------------------------------------------------
    # GENERATOR
    # --------------------------------------------------------

    def generate():

        try:

            # Ask Groq for streaming response

            stream = client.chat.completions.create(

                model=model,

                messages=messages,

                stream=True

            )


            # --------------------------------------------
            # SEND EACH CHUNK
            # --------------------------------------------

            for chunk in stream:

                content = (
                    chunk.choices[0]
                    .delta
                    .content
                )


                if content:

                    # Send SSE event

                    data = json.dumps({

                        "content": content

                    })


                    yield f"data: {data}\n\n"


            # --------------------------------------------
            # END STREAM
            # --------------------------------------------

            yield "data: [DONE]\n\n"


        except Exception as e:

            error_data = json.dumps({

                "error": str(e)

            })


            yield f"data: {error_data}\n\n"


    # --------------------------------------------------------
    # RETURN STREAM
    # --------------------------------------------------------

    return StreamingResponse(

        generate(),

        media_type="text/event-stream",

        headers={

            "Cache-Control":
                "no-cache",

            "Connection":
                "keep-alive",

            "X-Accel-Buffering":
                "no"

        }

    )