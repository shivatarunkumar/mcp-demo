from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import access, auth, admin, chat, customers, orders, products, query, transactions

app = FastAPI(title="Retails DB API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(access.router)
app.include_router(customers.router)
app.include_router(products.router)
app.include_router(orders.router)
app.include_router(transactions.router)
app.include_router(query.router)
app.include_router(chat.router)


@app.get("/", tags=["health"])
async def root():
    return {"status": "ok"}
