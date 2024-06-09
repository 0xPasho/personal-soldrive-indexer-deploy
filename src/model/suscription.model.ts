import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Suscription {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column()
    user!: string;

    @Column()
    timestamp!: Date;

}
