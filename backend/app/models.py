from datetime import datetime
from decimal import Decimal

from sqlalchemy import DECIMAL, ForeignKey, Integer, String, TIMESTAMP, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(20))
    city: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime | None] = mapped_column(TIMESTAMP, server_default=func.now())

    orders: Mapped[list["Order"]] = relationship("Order", back_populates="customer")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str | None] = mapped_column(String(100))
    category: Mapped[str | None] = mapped_column(String(50))
    price: Mapped[Decimal | None] = mapped_column(DECIMAL(10, 2))
    stock: Mapped[int | None] = mapped_column(Integer)


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    customer_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("customers.id"))
    order_date: Mapped[datetime | None] = mapped_column(TIMESTAMP, server_default=func.now())
    status: Mapped[str | None] = mapped_column(String(20))
    total: Mapped[Decimal | None] = mapped_column(DECIMAL(10, 2))

    customer: Mapped["Customer"] = relationship("Customer", back_populates="orders")
    transactions: Mapped[list["Transaction"]] = relationship("Transaction", back_populates="order")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("orders.id"))
    amount: Mapped[Decimal | None] = mapped_column(DECIMAL(10, 2))
    payment_method: Mapped[str | None] = mapped_column(String(30))
    transaction_date: Mapped[datetime | None] = mapped_column(TIMESTAMP, server_default=func.now())
    status: Mapped[str | None] = mapped_column(String(20))

    order: Mapped["Order"] = relationship("Order", back_populates="transactions")


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    customer_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("customers.id"))
    product_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("products.id"))
    rating: Mapped[int | None] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime | None] = mapped_column(TIMESTAMP, server_default=func.now())

    customer: Mapped["Customer"] = relationship("Customer")
    product: Mapped["Product"] = relationship("Product")
