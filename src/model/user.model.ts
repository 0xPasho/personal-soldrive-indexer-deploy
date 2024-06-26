import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  slot!: number;

  @Column({ nullable: true })
  user_solana?: string;

  @Column({ nullable: true })
  did_public_address?: string;

  @Column({ nullable: true })
  username?: string;

  @Column({ nullable: true })
  did_public_key?: string;
}
