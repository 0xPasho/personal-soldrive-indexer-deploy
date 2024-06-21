import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Subscription {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column()
    user!: string;

    @Column()
    timestamp!: Date;

}
